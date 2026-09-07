import { For, Show } from "solid-js";
import { definePage } from "../../../../solid/page";
import { useAdminArticle } from "../../../../solid/queries";
import { ArticleBody, date, Header, qs } from "../../app";

export function AdminArticlePreview(props: { mobile?: boolean }) {
  if (props.mobile) {
    return (
      <div class="shell preview-shell">
        <Header admin />
        <div class="preview-toolbar">
          <strong>移动端预览</strong>
          <span>已保存版本 · 375px</span>
          <a href={`/admin/articles/edit.html?id=${qs().get("id") ?? ""}`}>
            返回编辑
          </a>
        </div>
        <iframe
          class="mobile-preview-frame"
          title="移动端文章预览"
          src={`/admin/articles/preview/mobile/content.html?id=${qs().get("id") ?? ""}`}
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
        <a href={`/admin/articles/edit.html?id=${id ?? ""}`}>返回编辑</a>
      </div>
      <main id="main">
        <Show
          when={savedArticle()}
          fallback={<div class="state">文章不存在或暂不可见</div>}
        >
          {(saved) => (
            <article class="article">
              <a
                class="back-link"
                href={`/admin/articles/edit.html?id=${saved().id}`}
              >
                ← 返回编辑
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
