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

const previewKey = "admin.article.preview";
function cachedArticle(): Article | undefined {
  try {
    const raw = sessionStorage.getItem(previewKey);
    return raw ? (JSON.parse(raw) as Article) : undefined;
  } catch {
    return;
  }
}

const App = () => {
  const id = qs().get("id");
  const cached = cachedArticle();
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
  const publish = async () => {
    const value = current();
    if (!value) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!value.title.trim() || !value.articleTypeId)
        throw new Error("请返回编辑页填写标题和文章类型");
      let saved = await unwrap(
        client.draftEditor.saveDraft({
          id: value.id ? (value.id as ArticleId) : undefined,
          title: value.title,
          summary: value.summary ?? "",
          articleTypeId: value.articleTypeId,
          termIds: value.termIds,
          contentHtml: value.contentHtml,
        }),
      );
      if (saved.status === "draft")
        saved = await unwrap(client.draftEditor.publish(saved.id));
      setArticle(saved);
      sessionStorage.setItem(previewKey, JSON.stringify(saved));
      setMessage("文章已保存并发布");
    } catch (reason) {
      setError((reason as Error).message);
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
                  <span>当前内容仅供检查，发布前不会出现在访客页面。</span>
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
                  <ArticleBody html={value().contentHtml} />
                  <div class="actions">
                    {value().status === "draft" ? (
                      <button
                        class="primary"
                        onClick={publish}
                        disabled={busy()}
                      >
                        保存并发布
                      </button>
                    ) : (
                      <button onClick={publish} disabled={busy()}>
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
