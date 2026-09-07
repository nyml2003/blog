import { createEffect, createSignal, For, Show } from "solid-js";
import {
  adminQueryErrorMessage,
  type AdminEditorArticle,
  type QueryError as DataError,
  type QueryReadonly as DeepReadonly,
  saveAdminEditorArticle,
  unpublishArticle,
  useAdminArticleTypes,
  useAdminEditorArticle,
  useAdminTerms,
  useHtmlInspection,
} from "../../../../solid/queries";
import type { HtmlInspection } from "../../../../common/validation/article-html";
import { type Article, Header, qs, Status } from "../../app";
import { ArticleSourceEditor } from "./article-source-editor";
import {
  editorSnapshot,
  editorSnapshotsEqual,
  type EditorSnapshot,
} from "./editor-state";
export function Editor() {
  const initialId = qs().get("id");
  const [currentId, setCurrentId] = createSignal(
    initialId ? Number(initialId) : 0,
  );
  const loaded = useAdminEditorArticle(() => initialId);
  const types = useAdminArticleTypes();
  const terms = useAdminTerms();
  const [title, setTitle] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [typeId, setTypeId] = createSignal("");
  const [termIds, setTermIds] = createSignal<number[]>([]);
  const [html, setHtml] = createSignal("");
  const [status, setStatus] = createSignal<Article["status"]>("draft");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const [previewOpen, setPreviewOpen] = createSignal(false);
  const [savedSnapshot, setSavedSnapshot] = createSignal<EditorSnapshot>();
  const [serverInspection, setServerInspection] = createSignal<{
    source: string;
    inspection: DeepReadonly<HtmlInspection>;
  }>();
  const validation = useHtmlInspection(html);
  const inspection = () => {
    const server = serverInspection();
    return server?.source === html() ? server.inspection : validation.current();
  };
  const validationError = () => {
    const failure = validation.resource.error();
    return failure !== undefined && "message" in failure ? failure.message : "";
  };
  const snapshot = () =>
    editorSnapshot({
      title: title(),
      summary: summary(),
      typeId: Number(typeId()) || 0,
      termIds: termIds(),
      contentHtml: html(),
    });
  const dirty = () => !editorSnapshotsEqual(savedSnapshot(), snapshot());
  const savedInspection = () => {
    const server = serverInspection();
    return server?.source === html() ? server.inspection : undefined;
  };
  const previewDisabled = () =>
    busy() || !currentId() || dirty() || savedInspection()?.valid !== true;
  const showFailure = (failure: DataError, source: string) => {
    setError(adminQueryErrorMessage(failure));
    if (failure.kind === "html-validation")
      setServerInspection({ source, inspection: failure.htmlInspection });
  };
  const rememberSavedArticle = (
    article: AdminEditorArticle,
    source: string,
  ) => {
    setCurrentId(article.id);
    setPreviewOpen(false);
    setServerInspection({ source, inspection: article.htmlInspection });
    setSavedSnapshot(
      editorSnapshot({
        title: article.title,
        summary: article.summary ?? "",
        typeId: article.articleTypeId,
        termIds: article.termIds,
        contentHtml: article.contentHtml,
      }),
    );
    if (!initialId)
      history.replaceState(
        null,
        "",
        `/admin/articles/edit.html?id=${article.id}`,
      );
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
    setServerInspection({
      source: value.contentHtml,
      inspection: value.htmlInspection,
    });
    setSavedSnapshot(
      editorSnapshot({
        title: value.title,
        summary: value.summary ?? "",
        typeId: value.articleTypeId,
        termIds: value.termIds ?? [],
        contentHtml: value.contentHtml,
      }),
    );
    initialized = true;
  });
  const save = async (publish = false) => {
    if (busy() || (publish && inspection()?.valid !== true)) return;
    setBusy(true);
    setError("");
    setMessage("");
    const source = html();
    const outcome = await saveAdminEditorArticle(
      {
        id: currentId(),
        title: title(),
        summary: summary(),
        articleTypeId: Number(typeId()),
        termIds: termIds(),
        contentHtml: source,
      },
      publish,
    );
    if (outcome.kind === "save-failed") {
      showFailure(outcome.error, source);
      setBusy(false);
      return;
    }
    rememberSavedArticle(outcome.savedArticle, source);
    if (outcome.kind === "publish-failed") {
      showFailure(outcome.error, source);
      setBusy(false);
      return;
    }
    setStatus(outcome.article.status);
    setMessage(publish ? "文章已保存并发布" : "文章已保存");
    setBusy(false);
  };
  const unpublish = async () => {
    if (busy() || !currentId()) return;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await unpublishArticle(currentId());
    if (!result.ok) {
      showFailure(result.error, html());
      setBusy(false);
      return;
    }
    setStatus(result.value.status);
    setPreviewOpen(false);
    setServerInspection({
      source: result.value.contentHtml,
      inspection: result.value.htmlInspection,
    });
    setMessage("文章已取消发布并恢复为草稿");
    setBusy(false);
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
          <div class="actions">
            <a
              class="button"
              href="/admin/editor-guide/index.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              使用指南
            </a>
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
            <fieldset class="editor-fields" aria-label="文章内容">
              <div class="editor-form">
                <div class="editor-form-row">
                  <div class="field">
                    <label for="title">标题</label>
                    <input
                      id="title"
                      disabled={busy()}
                      value={title()}
                      onInput={(event) => setTitle(event.currentTarget.value)}
                    />
                  </div>
                  <div class="field">
                    <label for="article-type">文章类型</label>
                    <select
                      id="article-type"
                      disabled={busy()}
                      value={typeId()}
                      onChange={(event) => setTypeId(event.currentTarget.value)}
                    >
                      <option value="">请选择类型</option>
                      <For each={types.snapshot() ?? []}>
                        {(type) => <option value={type.id}>{type.name}</option>}
                      </For>
                    </select>
                  </div>
                </div>
                <div class="editor-form-row editor-form-row-wide">
                  <div class="field">
                    <label for="summary">摘要</label>
                    <textarea
                      id="summary"
                      disabled={busy()}
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
                  <fieldset class="term-picker" disabled={busy()}>
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
                </div>
              </div>
              <ArticleSourceEditor
                value={html}
                busy={busy}
                inspection={inspection}
                pending={() => validation.resource.loading()}
                error={validationError}
                onChange={(value) => {
                  setServerInspection(undefined);
                  setHtml(value);
                }}
                retry={() => {
                  setServerInspection(undefined);
                  void validation.resource.refetch();
                }}
              />
            </fieldset>
            <div class="actions editor-actions">
              <button
                type="button"
                onClick={() => save(false)}
                disabled={busy()}
              >
                保存
              </button>
              <Show
                when={status() === "published"}
                fallback={
                  <button
                    type="button"
                    class="primary"
                    onClick={() => save(true)}
                    disabled={busy() || inspection()?.valid !== true}
                  >
                    保存并发布
                  </button>
                }
              >
                <button
                  type="button"
                  class="danger"
                  onClick={unpublish}
                  disabled={busy() || !currentId()}
                >
                  取消发布
                </button>
              </Show>
              <div class="preview-menu">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={previewOpen()}
                  disabled={previewDisabled()}
                  onClick={() => setPreviewOpen(!previewOpen())}
                >
                  端到端预览
                </button>
                <div
                  class="preview-menu-items"
                  role="menu"
                  hidden={!previewOpen()}
                >
                  <a
                    href={`/admin/articles/preview/desktop.html?id=${currentId()}`}
                    role="menuitem"
                    onClick={() => setPreviewOpen(false)}
                  >
                    桌面端预览
                  </a>
                  <a
                    href={`/admin/articles/preview/mobile.html?id=${currentId()}`}
                    role="menuitem"
                    onClick={() => setPreviewOpen(false)}
                  >
                    移动端预览
                  </a>
                </div>
              </div>
            </div>
          </Show>
        </Show>
      </main>
    </div>
  );
}
