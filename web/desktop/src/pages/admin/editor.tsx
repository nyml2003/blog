import { createEffect, createSignal, For, Show } from "solid-js";
import {
  browserClient as client,
  type ArticleId,
} from "../../../../common/client";
import { useDataResource } from "../../../../solid/data";
import { type Article, Header, qs, Status } from "../../app";

async function unwrap<T>(task: {
  start(): Promise<
    | { ok: true; value: T }
    | { ok: false; error: { kind: string; message?: string } }
  >;
}) {
  const result = await task.start();
  if (!result.ok) throw new Error(result.error.message ?? result.error.kind);
  return result.value;
}

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
const previewKey = "admin.article.preview";

function previewDraft(id: string | null): Article | undefined {
  try {
    const raw = sessionStorage.getItem(previewKey);
    if (!raw) return;
    const value = JSON.parse(raw) as Article;
    if ((id && value.id === Number(id)) || (!id && value.id === 0))
      return value;
  } catch {
    sessionStorage.removeItem(previewKey);
  }
}

export function Editor() {
  const id = qs().get("id");
  const cached = previewDraft(id);
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
    id: id ? Number(id) : 0,
    title: title(),
    summary: summary(),
    articleTypeId: Number(typeId()),
    termIds: termIds(),
    contentHtml: html(),
    status: status(),
  });
  const save = async (publish = false) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!title().trim() || !Number(typeId()))
        throw new Error("请填写标题并选择文章类型");
      const body = {
        sceneCode: id ? "admin.article_update" : "admin.article_create",
        ...(id ? { id: Number(id) } : {}),
        title: title().trim(),
        summary: summary().trim(),
        articleTypeId: Number(typeId()),
        termIds: termIds(),
        contentHtml: html(),
      };
      let article = await unwrap(
        client.draftEditor.saveDraft({
          ...body,
          id: id ? (Number(id) as ArticleId) : undefined,
        }),
      );
      if (publish && article.status === "draft")
        article = await unwrap(client.draftEditor.publish(article.id));
      setStatus(article.status);
      sessionStorage.removeItem(previewKey);
      setMessage(publish ? "文章已保存并发布" : "文章已保存");
      if (!id) location.assign(`/admin/articles/edit.html?id=${article.id}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const unpublish = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!id) throw new Error("缺少文章 ID");
      const article = await unwrap(
        client.draftEditor.unpublish(Number(id) as ArticleId),
      );
      setStatus(article.status);
      setMessage("文章已取消发布并恢复为草稿");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const preview = () => {
    sessionStorage.setItem(previewKey, JSON.stringify(draft()));
    location.assign(`/admin/articles/preview.html${id ? `?id=${id}` : ""}`);
  };

  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page editor-page">
        <header class="admin-page-head">
          <div>
            <p class="eyebrow">ARTICLE SOURCE</p>
            <h1>{id ? "编辑文章" : "新建文章"}</h1>
            <p>正文以 HTML 片段保存，前台阅读外壳会统一处理排版。</p>
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
                        <small>{term.kind === "topic" ? "主题" : "标签"}</small>
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
                    value={html()}
                    onInput={(event) => setHtml(event.currentTarget.value)}
                    spellcheck={false}
                  />
                </div>
              </section>
            </div>
            <div class="actions editor-actions">
              <button onClick={() => save(false)} disabled={busy()}>
                保存
              </button>
              <button onClick={preview} disabled={busy()}>
                预览
              </button>
              {status() === "published" ? (
                <button
                  class="danger"
                  onClick={unpublish}
                  disabled={busy() || !id}
                >
                  取消发布
                </button>
              ) : (
                <button
                  class="primary"
                  onClick={() => save(true)}
                  disabled={busy()}
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
