import { createEffect, createSignal, For, Show } from "solid-js";
import {
  browserClient as client,
  type ArticleId,
} from "../../../../common/client";
import { useDataResource } from "../../../../solid/data";
import { type Article, Header, qs, Status } from "../../app";
import type { DataError } from "../../../../common/data/errors";
import type { DeepReadonly } from "../../../../common/data/readonly";
import type {
  HtmlDiagnostic,
  HtmlInspection,
} from "../../../../common/validation/article-html";
import { byteOffsetToSelection } from "../../../../common/validation/article-html";
import { cachedPreviewDraft, previewKey } from "./preview-cache";
import { HtmlDiagnostics, useHtmlInspection } from "./html-inspection";

const emptyArticle: Article = {
  id: 0,
  title: "",
  summary: "",
  articleTypeId: 0,
  contentHtml: "",
  termIds: [],
  terms: [],
  status: "draft",
  createdAt: "",
  updatedAt: "",
};
export function Editor() {
  const id = qs().get("id");
  const cached = cachedPreviewDraft(id);
  const [currentId, setCurrentId] = createSignal(id ? Number(id) : 0);
  const loaded = useDataResource(
    () => id,
    (articleId) =>
      articleId && !cached
        ? client.adminArticles.get(Number(articleId) as ArticleId)
        : {
            start: () =>
              Promise.resolve({ ok: true, value: cached ?? emptyArticle }),
            cancel: () => undefined,
          },
  );
  const types = useDataResource(
    () => undefined,
    () => client.taxonomy.listTypes(true),
  );
  const terms = useDataResource(
    () => undefined,
    () => client.taxonomy.listTerms(true),
  );
  const [title, setTitle] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [typeId, setTypeId] = createSignal("");
  const [termIds, setTermIds] = createSignal<number[]>([]);
  const [html, setHtml] = createSignal("");
  const [status, setStatus] = createSignal<Article["status"]>("draft");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const [serverInspection, setServerInspection] = createSignal<{
    source: string;
    inspection: DeepReadonly<HtmlInspection>;
  }>();
  const validation = useHtmlInspection(html);
  const inspection = () => {
    const server = serverInspection();
    if (server?.source === html()) return server.inspection;
    return validation.current();
  };
  const valid = () => validation.valid() && inspection()?.valid === true;
  const validationError = () => {
    const failure = validation.resource.error();
    if (failure !== undefined && "message" in failure) return failure.message;
    return "";
  };
  let htmlField: HTMLTextAreaElement | undefined;
  const locate = (diagnostic: DeepReadonly<HtmlDiagnostic>) => {
    htmlField?.focus();
    htmlField?.setSelectionRange(
      byteOffsetToSelection(html(), diagnostic.span.start.byte),
      byteOffsetToSelection(html(), diagnostic.span.end.byte),
    );
  };
  const showFailure = (failure: DataError, source: string) => {
    setError("message" in failure ? failure.message : "请求未完成，请重试");
    if (failure.kind === "html-validation")
      setServerInspection({ source, inspection: failure.htmlInspection });
  };
  let initialized = false;
  createEffect(() => {
    const value = loaded.snapshot();
    if (!value || initialized) return;
    setTitle(value.title);
    setSummary(value.summary ?? "");
    setTypeId(String(value.articleTypeId || ""));
    setTermIds([...(value.termIds ?? [])]);
    setHtml(value.contentHtml);
    setStatus(value.status);
    initialized = true;
  });

  const draft = (): Article => ({
    ...(loaded.snapshot() ?? emptyArticle),
    id: currentId(),
    title: title(),
    summary: summary(),
    articleTypeId: Number(typeId()),
    termIds: termIds(),
    contentHtml: html(),
    status: status(),
  });
  const save = async (publish = false) => {
    if (busy()) return;
    if (publish && !valid()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!title().trim() || !Number(typeId()))
        throw new Error("请填写标题并选择文章类型");
      const source = html();
      const body = {
        id: currentId() ? (currentId() as ArticleId) : undefined,
        title: title().trim(),
        summary: summary().trim(),
        articleTypeId: Number(typeId()),
        termIds: termIds(),
        contentHtml: source,
      };
      const saved = await client.draftEditor.saveDraft(body).start();
      if (!saved.ok) {
        showFailure(saved.error, source);
        return;
      }
      let article = saved.value;
      setCurrentId(article.id);
      setServerInspection({ source, inspection: article.htmlInspection });
      if (!id)
        history.replaceState(
          null,
          "",
          `/admin/articles/edit.html?id=${article.id}`,
        );
      if (publish && article.status === "draft") {
        const published = await client.draftEditor.publish(article.id).start();
        if (!published.ok) {
          showFailure(published.error, source);
          return;
        }
        article = published.value;
      }
      setStatus(article.status);
      try {
        sessionStorage.removeItem(previewKey);
      } catch {
        /* Storage is optional for saving. */
      }
      setMessage(publish ? "文章已保存并发布" : "文章已保存");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  const unpublish = async () => {
    if (busy()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!currentId()) throw new Error("缺少文章 ID");
      const result = await client.draftEditor
        .unpublish(currentId() as ArticleId)
        .start();
      if (!result.ok) {
        showFailure(result.error, html());
        return;
      }
      setStatus(result.value.status);
      setMessage("文章已取消发布并恢复为草稿");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "取消发布失败，请重试",
      );
    } finally {
      setBusy(false);
    }
  };
  const preview = () => {
    if (busy() || !valid()) return;
    try {
      sessionStorage.setItem(previewKey, JSON.stringify(draft()));
      location.assign(
        `/admin/articles/preview.html${currentId() ? `?id=${currentId()}` : ""}`,
      );
    } catch {
      setError("无法暂存预览，编辑内容仍保留在当前页面");
    }
  };

  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page editor-page">
        <header class="admin-page-head">
          <div>
            <p class="eyebrow">ARTICLE SOURCE</p>
            <h1>{currentId() ? "编辑文章" : "新建文章"}</h1>
          </div>
        </header>
        <Show
          when={loaded.status() !== "loading"}
          fallback={<div class="state">加载中...</div>}
        >
          <Show
            when={loaded.status() !== "error"}
            fallback={<div class="error">文章加载失败或不存在</div>}
          >
            <Status busy={busy()} error={error()} ok={message()} />
            <fieldset
              class="editor-fields"
              disabled={busy()}
              aria-label="文章内容"
            >
              <div class="editor-grid">
                <aside class="editor-meta">
                  <div class="field">
                    <label for="title">标题</label>
                    <input
                      id="title"
                      value={title()}
                      onInput={(event) => setTitle(event.currentTarget.value)}
                    />
                  </div>
                  <div class="field">
                    <label for="article-type">文章类型</label>
                    <select
                      id="article-type"
                      value={typeId()}
                      onChange={(event) => setTypeId(event.currentTarget.value)}
                    >
                      <option value="">请选择类型</option>
                      <For each={types.snapshot() ?? []}>
                        {(type) => <option value={type.id}>{type.name}</option>}
                      </For>
                    </select>
                  </div>
                  <div class="field">
                    <label for="summary">摘要</label>
                    <textarea
                      id="summary"
                      value={summary()}
                      maxLength={160}
                      rows={4}
                      onInput={(event) => setSummary(event.currentTarget.value)}
                      aria-describedby="summary-help"
                    />
                    <small id="summary-help">
                      可选，{summary().length}/160 字
                    </small>
                  </div>
                  <fieldset class="term-picker">
                    <legend>主题/标签</legend>
                    <For each={terms.snapshot() ?? []}>
                      {(term) => (
                        <label>
                          <input
                            type="checkbox"
                            checked={termIds().includes(term.id)}
                            onChange={(event) =>
                              setTermIds(
                                event.currentTarget.checked
                                  ? [...termIds(), term.id]
                                  : termIds().filter(
                                      (value) => value !== term.id,
                                    ),
                              )
                            }
                          />
                          <span>{term.name}</span>
                          <small>
                            {term.kind === "topic" ? "主题" : "标签"}
                          </small>
                        </label>
                      )}
                    </For>
                  </fieldset>
                  <p class={`status-${status()}`}>
                    当前状态：{status() === "published" ? "已发布" : "草稿"}
                  </p>
                </aside>
                <section class="editor-source">
                  <div class="field">
                    <label for="html">HTML 正文</label>
                    <textarea
                      id="html"
                      ref={(element) => {
                        htmlField = element;
                      }}
                      value={html()}
                      onInput={(event) => {
                        setServerInspection(undefined);
                        setHtml(event.currentTarget.value);
                      }}
                      spellcheck={false}
                      aria-describedby="html-diagnostics"
                      aria-invalid={inspection()?.valid === false}
                    />
                  </div>
                  <HtmlDiagnostics
                    inspection={inspection()}
                    pending={validation.resource.loading()}
                    error={validationError()}
                    retry={() => {
                      setServerInspection(undefined);
                      void validation.resource.refetch();
                    }}
                    locate={locate}
                  />
                </section>
              </div>
            </fieldset>
            <div class="actions editor-actions">
              <button onClick={() => save(false)} disabled={busy()}>
                保存
              </button>
              <button onClick={preview} disabled={busy() || !valid()}>
                预览
              </button>
              {status() === "published" ? (
                <button
                  class="danger"
                  onClick={unpublish}
                  disabled={busy() || !currentId()}
                >
                  取消发布
                </button>
              ) : (
                <button
                  class="primary"
                  onClick={() => save(true)}
                  disabled={busy() || !valid()}
                >
                  保存并发布
                </button>
              )}
            </div>
          </Show>
        </Show>
      </main>
    </div>
  );
}
