import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { useDesktopResource } from "../resource";
import type { DesktopPageContext } from "../context";
import { route } from "../context";
import { createDataResource } from "@fluvient-loom/query";
import { type DeepReadonly } from "@fluvient-loom/common";
import type { HtmlInspection } from "../../validation/article-html";
import { inspectHtml } from "../../validation/wasm";
import {
  createBrowserEditorDraftStorage,
  clearEditorSessionDraft,
  takeEditorSessionDraft,
  writeEditorSessionDraft,
} from "../editor-session-storage";
import { editorSnapshot } from "../logic/editor-state";
import { DesktopSourceEditor } from "../components/source-editor";
import { positiveIdFromSearch } from "../../route-input";

function numberList(value: string): number[] {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

export function createDesktopEditorPage(
  context: DesktopPageContext,
  creation: boolean,
) {
  return function DesktopEditorPage() {
    const draftStorage = createBrowserEditorDraftStorage();
    const articleId =
      positiveIdFromSearch(context.navigation.current().search, "id") ?? 0;
    const workspace = useDesktopResource(() => context.api.content.workspace());
    const article = useDesktopResource(() =>
      context.api.content.getArticle(articleId),
    );
    const [version, setVersion] = createSignal(0);
    const [title, setTitle] = createSignal("");
    const [summary, setSummary] = createSignal("");
    const [categories, setCategories] = createSignal("");
    const [tags, setTags] = createSignal("");
    const [contentHtml, setContentHtml] = createSignal("");
    const [busy, setBusy] = createSignal(false);
    const [message, setMessage] = createSignal("");
    const [error, setError] = createSignal("");
    const inspectionResource = createDataResource(() =>
      inspectHtml(contentHtml()),
    );
    const [inspection, setInspection] =
      createSignal<DeepReadonly<HtmlInspection>>();
    let inspectionSource = "";
    const inspectionError = () => {
      const value = inspectionResource.getSnapshot().error;
      return value && "message" in value ? value.message : "";
    };
    createEffect(() => {
      const source = contentHtml();
      if (source === inspectionSource) return;
      inspectionSource = source;
      void inspectionResource.refetch().then((result) => {
        if (result.ok && source === contentHtml()) setInspection(result.value);
      });
    });
    let initialized = false;
    createEffect(() => {
      const workspaceValue = workspace.state().snapshot;
      if (!workspaceValue || initialized) return;
      if (creation) {
        setVersion(workspaceValue.version);
        const draft = takeEditorSessionDraft(
          draftStorage,
          `${window.location.pathname}${window.location.search}`,
        );
        if (draft) {
          setVersion(draft.expectedVersion);
          setTitle(draft.values.title);
          setSummary(draft.values.summary);
          setCategories(draft.values.categoryIds.join(", "));
          setTags(draft.values.tagIds.join(", "));
          setContentHtml(draft.values.contentHtml);
          setMessage("已恢复登录前未保存的文章内容");
        }
        initialized = true;
        return;
      }
      const detail = article.state().snapshot;
      if (!detail) return;
      setVersion(detail.version);
      setTitle(detail.article.title);
      setSummary(detail.article.summary);
      setCategories(detail.article.categoryIds.join(", "));
      setTags(detail.article.tagIds.join(", "));
      setContentHtml(detail.article.contentHtml);
      const draft = takeEditorSessionDraft(
        draftStorage,
        `${window.location.pathname}${window.location.search}`,
      );
      if (draft) {
        setVersion(draft.expectedVersion);
        setTitle(draft.values.title);
        setSummary(draft.values.summary);
        setCategories(draft.values.categoryIds.join(", "));
        setTags(draft.values.tagIds.join(", "));
        setContentHtml(draft.values.contentHtml);
        setMessage("已恢复登录前未保存的文章内容");
      }
      initialized = true;
    });
    onMount(() => {
      const persist = () => {
        if (!initialized) return;
        writeEditorSessionDraft(draftStorage, {
          schemaVersion: 1,
          returnPath: `${window.location.pathname}${window.location.search}`,
          expectedVersion: version(),
          values: {
            ...editorSnapshot({
              title: title(),
              summary: summary(),
              categoryIds: numberList(categories()),
              tagIds: numberList(tags()),
              contentHtml: contentHtml(),
            }),
            id: articleId,
          },
        });
      };
      window.addEventListener("blog:admin-session-expired", persist);
      onCleanup(() =>
        window.removeEventListener("blog:admin-session-expired", persist),
      );
    });
    const save = async () => {
      if (busy() || !initialized || title().trim() === "") {
        setError("请填写文章标题");
        return;
      }
      if (!inspection() || !inspection()?.valid) {
        setError("正文 HTML 校验未通过，请修正后再保存");
        return;
      }
      setBusy(true);
      setError("");
      setMessage("");
      const result = await context.api.content
        .saveArticle({
          expectedVersion: version(),
          article: {
            ...(articleId > 0 ? { id: articleId } : {}),
            title: title().trim(),
            summary: summary().trim(),
            categoryIds: numberList(categories()),
            tagIds: numberList(tags()),
            contentHtml: contentHtml(),
          },
        })
        .start();
      setBusy(false);
      if (!result.ok) {
        setError(
          "message" in result.error
            ? result.error.message
            : "请求未完成，请重试",
        );
        return;
      }
      setVersion(result.value.workspace.version);
      setTitle(result.value.article.title);
      setSummary(result.value.article.summary);
      setCategories(result.value.article.categoryIds.join(", "));
      setTags(result.value.article.tagIds.join(", "));
      setContentHtml(result.value.article.contentHtml);
      clearEditorSessionDraft(draftStorage);
      setMessage("已保存到待提交批次");
      if (creation) {
        context.navigation.replace(
          `${route(context.routes, "desktop-admin-article-edit")}?id=${result.value.article.id}`,
          null,
        );
      }
    };
    const loading = () =>
      workspace.state().status === "loading" ||
      (!creation && article.state().status === "loading");
    return (
      <main id="main" class="admin-page editor-page">
        <header class="admin-page-head">
          <div>
            <p class="eyebrow">WORKSPACE ARTICLE</p>
            <h1>{creation && articleId === 0 ? "新建文章" : "编辑文章"}</h1>
            <p>保存会进入当前待提交批次，发布前请在工作台统一预览。</p>
          </div>
          <div class="actions">
            <a
              class="button secondary"
              href={route(context.routes, "desktop-admin-editor-guide")}
            >
              使用指南
            </a>
            <a
              class="button secondary"
              href={route(context.routes, "desktop-admin-article-types")}
            >
              发布工作台
            </a>
          </div>
        </header>
        <Show when={!loading()} fallback={<p role="status">加载中...</p>}>
          <Show
            when={
              !workspace.state().error && (creation || !article.state().error)
            }
            fallback={<p role="alert">文章或工作区加载失败</p>}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label>
                标题
                <input
                  value={title()}
                  onInput={(event) => setTitle(event.currentTarget.value)}
                  disabled={busy()}
                />
              </label>
              <label>
                摘要
                <textarea
                  rows={3}
                  value={summary()}
                  onInput={(event) => setSummary(event.currentTarget.value)}
                  disabled={busy()}
                />
              </label>
              <label>
                分类 ID（逗号分隔）
                <input
                  value={categories()}
                  onInput={(event) => setCategories(event.currentTarget.value)}
                  disabled={busy()}
                />
              </label>
              <label>
                标签 ID（逗号分隔）
                <input
                  value={tags()}
                  onInput={(event) => setTags(event.currentTarget.value)}
                  disabled={busy()}
                />
              </label>
              <DesktopSourceEditor
                value={contentHtml}
                busy={busy}
                inspection={inspection}
                pending={() =>
                  inspectionResource.getSnapshot().status === "loading"
                }
                error={inspectionError}
                onChange={(value) => {
                  setInspection(undefined);
                  setContentHtml(value);
                }}
              />
              <div class="actions">
                <button type="submit" disabled={busy()}>
                  {busy() ? "保存中..." : "保存到待提交批次"}
                </button>
                <span role="status">{error() || message()}</span>
              </div>
            </form>
          </Show>
        </Show>
      </main>
    );
  };
}
