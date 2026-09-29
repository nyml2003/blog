import { ArrowLeft } from "lucide-solid";
import { For, Show } from "solid-js";
import { StateMessage } from "../../../../desktop-ui";
import { definePage } from "../../../../solid/page";
import {
  adminArticleEditHref,
  adminArticlePreviewMobileHref,
  useAdminArticle,
} from "../../../../solid/queries";
import { ArticleBody, date, Header, qs } from "../../shell";

export function AdminArticlePreview(props: { mobile?: boolean }) {
  if (props.mobile) {
    return (
      <div class="shell preview-shell">
        <Header admin />
        <div class="preview-toolbar">
          <strong>移动端预览</strong>
          <span>已保存版本 · 375px</span>
          <a href={adminArticleEditHref(qs().get("id") ?? "")}>返回编辑</a>
        </div>
        <iframe
          class="mobile-preview-frame"
          title="移动端文章预览"
          src={adminArticlePreviewMobileHref(qs().get("id") ?? "")}
        />
      </div>
    );
  }
  const id = qs().get("id");
  const article = useAdminArticle(() => id);
  const savedArticle = () => {
    const value = article.snapshot();
    if (article.loading() || !value || value.htmlInspection.valid !== true)
      return undefined;
    return value;
  };
  const previewStatus = () => {
    const saved = savedArticle();
    if (!saved) return "正在读取已保存版本";
    return `已保存版本 · ${saved.status === "published" ? "已发布" : "草稿"}`;
  };
  return (
    <div class="shell preview-shell">
      <Header admin />
      <div class="preview-toolbar">
        <strong>桌面端预览</strong>
        <span>{previewStatus()}</span>
        <a href={adminArticleEditHref(id ?? "")}>返回编辑</a>
      </div>
      <main id="main">
        <Show
          when={savedArticle()}
          fallback={
            <StateMessage content="文章不存在或暂不可见" kind="empty" />
          }
        >
          {(saved) => (
            <article class="article">
              <a class="back-link" href={adminArticleEditHref(saved().id)}>
                <ArrowLeft size={18} aria-hidden="true" />
                <span>返回编辑</span>
              </a>
              <p class="eyebrow">
                {saved().articleType?.name ?? `类型 #${saved().articleTypeId}`}
              </p>
              <h1>{saved().title}</h1>
              <Show when={saved().summary}>
                <p class="article-summary">{saved().summary}</p>
              </Show>
              <div class="meta">
                <span>
                  {saved().status === "published" ? "已发布" : "草稿"}
                </span>
                <span>更新于 {date(saved().updatedAt)}</span>
                <For each={saved().terms ?? []}>
                  {(term) => <span class="tag">{term.name}</span>}
                </For>
              </div>
              <div class="article-accent" aria-hidden="true" />
              <ArticleBody html={saved().contentHtml} />
            </article>
          )}
        </Show>
      </main>
    </div>
  );
}

definePage(AdminArticlePreview);
