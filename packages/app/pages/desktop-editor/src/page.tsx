import { createEffect, createSignal, Show } from "solid-js";
import { useDesktopResource } from "@blog/desktop-api";
import {
  Button,
  Field,
  Form,
  Heading,
  Input,
  Link,
  Text,
  Textarea,
} from "@blog/desktop-atoms";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { route } from "@blog/desktop-shared";
import { createDataResource } from "@fluvient-loom/query";
import { type DeepReadonly } from "@fluvient/core";
import type { HtmlInspection } from "@blog/validation";
import { inspectHtml } from "@blog/validation";
import "./page.css";
import {
  clearEditorSessionDraft,
  takeEditorSessionDraft,
} from "./persistence.ts";
import { DesktopSourceEditor } from "./source-editor.tsx";
import {
  desktopAdminArticleEditPage,
  desktopAdminArticleNewPage,
} from "./definition.ts";

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
    const draftStorage = context.sessionStorage;
    const currentPath = (): string => {
      const snapshot = context.navigation.current();
      return `${snapshot.pathname}${snapshot.search}`;
    };
    const entry = creation ? desktopAdminArticleNewPage : desktopAdminArticleEditPage;
    const params = entry.parseParams(context.navigation.current().search);
    const articleId = params.ok ? params.value.id ?? 0 : 0;
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
        const draft = takeEditorSessionDraft(draftStorage, currentPath());
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
      const draft = takeEditorSessionDraft(draftStorage, currentPath());
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
      <div class="admin-page editor-page">
        <header class="admin-page-head">
          <div>
            <Text tone="accent">WORKSPACE ARTICLE</Text>
            <Heading level={1}>
              {creation && articleId === 0 ? "新建文章" : "编辑文章"}
            </Heading>
            <Text tone="muted">
              保存会进入当前待提交批次，发布前请在工作台统一预览。
            </Text>
          </div>
          <div class="actions">
            <Link
              href={route(context.routes, "desktop-admin-editor-guide")}
              variant="action"
            >
              使用指南
            </Link>
            <Link
              href={route(context.routes, "desktop-admin-article-types")}
              variant="action"
            >
              发布工作台
            </Link>
          </div>
        </header>
        <Show
          when={!loading()}
          fallback={<Text role="status">加载中...</Text>}
        >
          <Show
            when={
              !workspace.state().error && (creation || !article.state().error)
            }
            fallback={
              <Text role="alert" tone="danger">
                文章或工作区加载失败
              </Text>
            }
          >
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Field label="标题">
                <Input
                  value={title()}
                  onInput={(event) => setTitle(event.currentTarget.value)}
                  disabled={busy()}
                />
              </Field>
              <Field label="摘要">
                <Textarea
                  rows={3}
                  value={summary()}
                  onInput={(event) => setSummary(event.currentTarget.value)}
                  disabled={busy()}
                />
              </Field>
              <Field label="分类 ID（逗号分隔）">
                <Input
                  value={categories()}
                  onInput={(event) => setCategories(event.currentTarget.value)}
                  disabled={busy()}
                />
              </Field>
              <Field label="标签 ID（逗号分隔）">
                <Input
                  value={tags()}
                  onInput={(event) => setTags(event.currentTarget.value)}
                  disabled={busy()}
                />
              </Field>
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
                <Button type="submit" variant="primary" disabled={busy()}>
                  {busy() ? "保存中..." : "保存到待提交批次"}
                </Button>
                <Text as="span" role="status" tone="muted">
                  {error() || message()}
                </Text>
              </div>
            </Form>
          </Show>
        </Show>
      </div>
    );
  };
}
