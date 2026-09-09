import { createSignal, Show } from "solid-js";
import { definePage } from "../../../../solid/page";
import {
  adminArticleNewHref,
  adminQueryErrorMessage,
  adminWorkspaceHref,
  stageContentArticleRemoval,
  useContentArticles,
  type ContentArticle,
} from "../../../../solid/queries";
import { Header, Status, WorkspaceArticleTable } from "../../app";

const App = () => {
  const articles = useContentArticles();
  const [busyArticleId, setBusyArticleId] = createSignal<number>();
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");

  const removeArticle = async (article: ContentArticle) => {
    const current = articles.snapshot();
    if (current === undefined || busyArticleId() !== undefined) return;
    const confirmed = window.confirm(
      `将《${article.title || "未命名文章"}》暂存下架到当前待提交批次？`,
    );
    if (!confirmed) return;
    setBusyArticleId(article.id);
    setMessage("");
    setError("");
    const result = await stageContentArticleRemoval(
      current.version,
      article.id,
      () => true,
    );
    if (result === undefined) {
      setBusyArticleId(undefined);
      return;
    }
    if (!result.ok) {
      setError(adminQueryErrorMessage(result.error));
      setBusyArticleId(undefined);
      return;
    }
    setMessage("已暂存下架到待提交批次，公共内容尚未改变。");
    const refreshed = await articles.refetch();
    if (!refreshed.ok) {
      setError("暂存下架已完成，但文章列表刷新失败，请刷新页面。");
    }
    setBusyArticleId(undefined);
  };

  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page">
        <div class="admin-page-head">
          <div>
            <p class="eyebrow">CONTENT WORKSPACE</p>
            <h1>文章管理</h1>
            <p>编辑工作区文章，并在发布工作台统一预览和提交。</p>
          </div>
          <div class="actions">
            <a class="button" href={adminWorkspaceHref()}>
              发布工作台
            </a>
            <a class="button primary" href={adminArticleNewHref()}>
              新建文章
            </a>
          </div>
        </div>
        <Status
          busy={busyArticleId() !== undefined}
          error={error()}
          ok={message()}
        />
        <Show
          when={articles.error() === undefined}
          fallback={<div class="error">文章工作区加载失败</div>}
        >
          <Show
            when={articles.snapshot()}
            fallback={<div class="state">加载中...</div>}
          >
            {(value) => (
              <>
                <p class="muted">工作区版本 {value().version}</p>
                <Show
                  when={value().articles.length > 0}
                  fallback={<div class="state">当前工作区没有文章</div>}
                >
                  <WorkspaceArticleTable
                    items={value().articles}
                    busyArticleId={busyArticleId()}
                    onRemove={(article) => void removeArticle(article)}
                  />
                </Show>
              </>
            )}
          </Show>
        </Show>
      </main>
    </div>
  );
};
definePage(App);
