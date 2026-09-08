import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  adminQueryErrorMessage,
  limitUnicodeScalars,
  saveContentArticle,
  unicodeScalarLength,
  useContentArticle,
  useContentWorkspace,
  useHtmlInspection,
  type ContentArticle,
  type QueryReadonly,
} from "../../../../solid/queries";
import type { HtmlInspection } from "../../../../common/validation/article-html";
import { Header, qs, Status } from "../../app";
import { ArticleSourceEditor } from "./article-source-editor";
import {
  editorPageTitle,
  editorSnapshot,
  editorSnapshotsEqual,
  valueForCurrentSource,
  type EditorSnapshot,
} from "./editor-state";
import {
  clearEditorSessionDraft,
  takeEditorSessionDraft,
  writeEditorSessionDraft,
} from "./editor-session-draft";

const workspacePath = "/admin/content/workspace.html";

export function Editor() {
  const initialId = qs().get("id");
  const initialCreation = initialId === null || initialId === "";
  const parsedInitialId =
    initialId !== null && /^\d+$/.test(initialId) ? Number(initialId) : 0;
  const [currentId, setCurrentId] = createSignal(parsedInitialId);
  const articleResource = useContentArticle(() => initialId);
  const workspace = useContentWorkspace();
  const [version, setVersion] = createSignal(0);
  const [title, setTitle] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [categoryIds, setCategoryIds] = createSignal<number[]>([]);
  const [tagIds, setTagIds] = createSignal<number[]>([]);
  const [html, setHtml] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const [initialized, setInitialized] = createSignal(false);
  const [savedSnapshot, setSavedSnapshot] = createSignal<EditorSnapshot>();
  const [serverInspection, setServerInspection] = createSignal<{
    readonly source: string;
    readonly inspection: QueryReadonly<HtmlInspection>;
  }>();
  const validation = useHtmlInspection(html);
  const inspection = () => {
    const server = serverInspection();
    return valueForCurrentSource(
      html(),
      server === undefined
        ? undefined
        : { source: server.source, value: server.inspection },
      validation.current(),
    );
  };
  const validationError = () => {
    const failure = validation.resource.error();
    return failure !== undefined && "message" in failure ? failure.message : "";
  };
  const taxonomy = () => workspace.snapshot()?.taxonomy;
  const categories = () => taxonomy()?.categories ?? [];
  const leafCategories = () => {
    const values = categories();
    const parentIds = new Set(
      values.flatMap((category) =>
        category.parentId === undefined ? [] : [category.parentId],
      ),
    );
    return values.filter((category) => !parentIds.has(category.id));
  };
  const tags = () => taxonomy()?.tags ?? [];
  const summaryLength = () => unicodeScalarLength(summary());
  const snapshot = () =>
    editorSnapshot({
      title: title(),
      summary: summary(),
      categoryIds: categoryIds(),
      tagIds: tagIds(),
      contentHtml: html(),
    });
  const dirty = () => !editorSnapshotsEqual(savedSnapshot(), snapshot());
  const loading = () =>
    !initialized() &&
    (workspace.loading() || (!initialCreation && articleResource.loading()));
  const loadFailed = () =>
    !initialized() &&
    (workspace.error() !== undefined ||
      (!initialCreation && articleResource.error() !== undefined));
  const ready = () => {
    if (!initialized() || loadFailed()) return false;
    return true;
  };

  const draftStorage = () => {
    try {
      return window.sessionStorage;
    } catch {
      return undefined;
    }
  };
  const returnPath = () => `${location.pathname}${location.search}`;

  const rememberSavedArticle = (article: ContentArticle) => {
    setCurrentId(article.id);
    setTitle(article.title);
    setSummary(article.summary);
    setCategoryIds([...article.categoryIds]);
    setTagIds([...article.tagIds]);
    setHtml(article.contentHtml);
    setServerInspection(undefined);
    setSavedSnapshot(
      editorSnapshot({
        title: article.title,
        summary: article.summary,
        categoryIds: article.categoryIds,
        tagIds: article.tagIds,
        contentHtml: article.contentHtml,
      }),
    );
  };

  const restoreSessionDraft = () => {
    const draft = takeEditorSessionDraft(draftStorage(), returnPath());
    if (draft === undefined) return;
    setCurrentId(draft.values.id);
    setVersion(draft.expectedVersion);
    setTitle(draft.values.title);
    setSummary(draft.values.summary);
    setCategoryIds([...draft.values.categoryIds]);
    setTagIds([...draft.values.tagIds]);
    setHtml(draft.values.contentHtml);
    setServerInspection(undefined);
    setMessage("已恢复登录前未保存的文章内容。");
  };

  createEffect(() => {
    if (initialized()) return;
    const workspaceValue = workspace.snapshot();
    if (workspaceValue === undefined) return;
    if (initialCreation) {
      setVersion(workspaceValue.version);
      setSavedSnapshot(snapshot());
      restoreSessionDraft();
      setInitialized(true);
      return;
    }
    const detail = articleResource.snapshot();
    if (detail === undefined) return;
    rememberSavedArticle(detail.article);
    setVersion(detail.version);
    restoreSessionDraft();
    setInitialized(true);
  });

  onMount(() => {
    let sessionRedirecting = false;
    let navigationAccepted = false;
    const persistForLogin = () => {
      sessionRedirecting = true;
      if (!initialized() || !dirty()) return;
      writeEditorSessionDraft(draftStorage(), {
        schemaVersion: 1,
        returnPath: returnPath(),
        expectedVersion: version(),
        values: {
          id: currentId(),
          title: title(),
          summary: summary(),
          categoryIds: categoryIds(),
          tagIds: tagIds(),
          contentHtml: html(),
        },
      });
    };
    const protectUnload = (event: BeforeUnloadEvent) => {
      if (
        !initialized() ||
        !dirty() ||
        sessionRedirecting ||
        navigationAccepted
      ) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    const protectNavigation = (event: MouseEvent) => {
      if (!initialized() || !dirty()) return;
      if (!(event.target instanceof Element)) return;
      const navigation = event.target.closest("a, button.nav-logout");
      if (navigation === null) return;
      const confirmed = window.confirm(
        "当前文章有未保存修改，确定离开编辑器？",
      );
      if (confirmed) {
        navigationAccepted = true;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, persistForLogin);
    window.addEventListener("beforeunload", protectUnload);
    document.addEventListener("click", protectNavigation, true);
    onCleanup(() => {
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, persistForLogin);
      window.removeEventListener("beforeunload", protectUnload);
      document.removeEventListener("click", protectNavigation, true);
    });
  });

  const toggleCategory = (id: number, checked: boolean) => {
    if (checked) {
      setCategoryIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
      return;
    }
    setCategoryIds((current) => current.filter((value) => value !== id));
  };

  const toggleTag = (id: number, checked: boolean) => {
    if (checked) {
      setTagIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
      return;
    }
    setTagIds((current) => current.filter((value) => value !== id));
  };

  const save = async () => {
    if (busy() || !ready()) return;
    setBusy(true);
    setError("");
    setMessage("");
    const wasNew = currentId() === 0;
    const result = await saveContentArticle(
      version(),
      {
        id: currentId(),
        title: title(),
        summary: summary(),
        categoryIds: categoryIds(),
        tagIds: tagIds(),
        contentHtml: html(),
      },
      validation.current(),
    );
    if (!result.ok) {
      if (result.error.kind === "html-validation") {
        setServerInspection({
          source: html(),
          inspection: result.error.htmlInspection,
        });
      }
      setError(adminQueryErrorMessage(result.error));
      setBusy(false);
      return;
    }
    rememberSavedArticle(result.value.article);
    setVersion(result.value.workspace.version);
    clearEditorSessionDraft(draftStorage());
    if (wasNew) {
      history.replaceState(
        null,
        "",
        `/admin/articles/edit.html?id=${result.value.article.id}`,
      );
    }
    setMessage("已保存到待提交批次。请前往发布工作台预览并提交。");
    setBusy(false);
  };

  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page editor-page">
        <header class="admin-page-head">
          <div>
            <p class="eyebrow">WORKSPACE ARTICLE</p>
            <h1>{editorPageTitle(initialCreation, currentId())}</h1>
            <p>保存会进入当前待提交批次，发布前请在工作台统一预览。</p>
          </div>
          <div class="actions">
            <a class="button" href="/admin/editor-guide/index.html">
              使用指南
            </a>
            <a class="button" href={workspacePath}>
              发布工作台
            </a>
          </div>
        </header>
        <Show when={!loading()} fallback={<div class="state">加载中...</div>}>
          <Show
            when={!loadFailed()}
            fallback={<div class="error">文章或工作区加载失败</div>}
          >
            <Status busy={busy()} error={error()} ok={message()} />
            <fieldset
              class="editor-fields"
              aria-label="文章内容"
              disabled={!ready()}
            >
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
                    <label for="summary">摘要</label>
                    <textarea
                      id="summary"
                      disabled={busy()}
                      value={summary()}
                      rows={3}
                      onInput={(event) =>
                        setSummary(
                          limitUnicodeScalars(event.currentTarget.value, 160),
                        )
                      }
                      aria-describedby="summary-help"
                    />
                    <small id="summary-help">
                      可选，{summaryLength()}/160 字
                    </small>
                  </div>
                </div>
                <div class="editor-form-row editor-taxonomy-row">
                  <fieldset class="term-picker" disabled={busy()}>
                    <legend>分类</legend>
                    <For each={leafCategories()}>
                      {(category) => (
                        <label>
                          <input
                            type="checkbox"
                            checked={categoryIds().includes(category.id)}
                            onChange={(event) =>
                              toggleCategory(
                                category.id,
                                event.currentTarget.checked,
                              )
                            }
                          />
                          <span>{category.name}</span>
                        </label>
                      )}
                    </For>
                  </fieldset>
                  <fieldset class="term-picker" disabled={busy()}>
                    <legend>标签</legend>
                    <For each={tags()}>
                      {(tag) => (
                        <label>
                          <input
                            type="checkbox"
                            checked={tagIds().includes(tag.id)}
                            onChange={(event) =>
                              toggleTag(tag.id, event.currentTarget.checked)
                            }
                          />
                          <span>{tag.name}</span>
                        </label>
                      )}
                    </For>
                  </fieldset>
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
              <span class="muted" role="status">
                {dirty() ? "有未保存修改" : `工作区版本 ${version()}`}
              </span>
              <a class="button" href={workspacePath}>
                预览待提交批次
              </a>
              <button
                type="button"
                class="primary"
                onClick={() => void save()}
                disabled={busy() || !ready()}
              >
                保存到待提交批次
              </button>
            </div>
          </Show>
        </Show>
      </main>
    </div>
  );
}
