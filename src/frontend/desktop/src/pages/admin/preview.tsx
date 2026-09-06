import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import {
  browserClient as client,
  type ArticleId,
} from "../../../../common/client";
import type { DataError } from "../../../../common/data/errors";
import { err } from "../../../../common/data/result";
import { createDataTask } from "../../../../common/data/task";
import { useDataResource } from "../../../../solid/data";
import { type Article, ArticleBody, date, Header, qs, Status } from "../../app";
import { cachedPreviewDraft, previewKey } from "./preview-cache";
import { HtmlDiagnostics, useHtmlInspection } from "./html-inspection";
import type { DeepReadonly } from "../../../../common/data/readonly";
import type { HtmlInspection } from "../../../../common/validation/article-html";

const App = () => {
  const id = qs().get("id");
  const cached = cachedPreviewDraft(id);
  const stored = useDataResource<Article, string | null, DataError>(
    () => id,
    (articleId) => {
      if (cached)
        return createDataTask<Article, DataError>(async () => ({
          ok: true,
          value: cached,
        }));
      if (!articleId)
        return createDataTask<Article, DataError>(async () =>
          err({ kind: "protocol", message: "缺少文章 ID" }),
        );
      return client.adminArticles.get(Number(articleId) as ArticleId);
    },
  );
  const [article, setArticle] = createSignal<Article | undefined>(cached);
  const [busy, setBusy] = createSignal(false),
    [message, setMessage] = createSignal(""),
    [error, setError] = createSignal("");
  const current = () => article() ?? stored.snapshot();
  const validation = useHtmlInspection(() => current()?.contentHtml ?? "");
  const [serverInspection, setServerInspection] =
    createSignal<DeepReadonly<HtmlInspection>>();
  const inspection = () => serverInspection() ?? validation.current();
  const valid = () => validation.valid() && inspection()?.valid === true;
  const validationError = () => {
    const failure = validation.resource.error();
    if (failure !== undefined && "message" in failure) return failure.message;
    return "";
  };
  const showFailure = (failure: DataError) => {
    setError("message" in failure ? failure.message : "请求未完成，请重试");
    if (failure.kind === "html-validation")
      setServerInspection(failure.htmlInspection);
  };
  const publish = async () => {
    const value = current();
    if (!value || busy() || !valid()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!value.title.trim() || !value.articleTypeId)
        throw new Error("请返回编辑页填写标题和文章类型");
      const result = await client.draftEditor
        .saveDraft({
          id: value.id ? (value.id as ArticleId) : undefined,
          title: value.title,
          summary: value.summary ?? "",
          articleTypeId: value.articleTypeId,
          termIds: value.termIds,
          contentHtml: value.contentHtml,
        })
        .start();
      if (!result.ok) {
        showFailure(result.error);
        return;
      }
      let saved = result.value;
      setArticle(saved);
      setServerInspection(saved.htmlInspection);
      history.replaceState(
        null,
        "",
        `/admin/articles/preview.html?id=${saved.id}`,
      );
      try {
        sessionStorage.setItem(previewKey, JSON.stringify(saved));
      } catch {
        /* Publishing does not require storage. */
      }
      if (saved.status === "draft") {
        const published = await client.draftEditor.publish(saved.id).start();
        if (!published.ok) {
          showFailure(published.error);
          return;
        }
        saved = published.value;
      }
      setArticle(saved);
      try {
        sessionStorage.setItem(previewKey, JSON.stringify(saved));
      } catch {
        /* Publishing does not require storage. */
      }
      setMessage("文章已保存并发布");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page preview-page">
        <Status busy={busy()} error={error()} ok={message()} />
        <Show
          when={!stored.loading()}
          fallback={<div class="state">加载中...</div>}
        >
          <Show
            when={current()}
            fallback={<div class="error">没有可预览的文章内容</div>}
          >
            {(value) => (
              <>
                <div class="preview-banner" role="status">
                  <strong>预览模式</strong>
                </div>
                <article class="article preview-article">
                  <p class="back-link">
                    <a
                      href={
                        value().id
                          ? `/admin/articles/edit.html?id=${value().id}`
                          : "/admin/articles/new.html"
                      }
                    >
                      返回编辑
                    </a>
                  </p>
                  <p class="eyebrow">
                    {value().articleType?.name ?? "ARTICLE PREVIEW"}
                  </p>
                  <h1>{value().title || "未命名文章"}</h1>
                  <Show when={value().summary}>
                    <p class="article-summary">{value().summary}</p>
                  </Show>
                  <div class="meta">
                    <span>
                      {value().articleType?.name ??
                        `类型 #${value().articleTypeId || "未选择"}`}
                    </span>
                    <span>
                      {value().status === "published" ? "已发布" : "草稿"}
                    </span>
                    <span>{date(value().updatedAt)}</span>
                  </div>
                  <HtmlDiagnostics
                    inspection={inspection()}
                    pending={validation.resource.loading()}
                    error={validationError()}
                    retry={() => {
                      setServerInspection(undefined);
                      void validation.resource.refetch();
                    }}
                    locate={undefined}
                  />
                  <Show when={valid()}>
                    <ArticleBody html={value().contentHtml} />
                  </Show>
                  <div class="actions">
                    {value().status === "draft" ? (
                      <button
                        class="primary"
                        onClick={publish}
                        disabled={busy() || !valid()}
                      >
                        保存并发布
                      </button>
                    ) : (
                      <button onClick={publish} disabled={busy() || !valid()}>
                        保存当前修改
                      </button>
                    )}
                  </div>
                </article>
              </>
            )}
          </Show>
        </Show>
      </main>
    </div>
  );
};
render(() => <App />, document.getElementById("app")!);
