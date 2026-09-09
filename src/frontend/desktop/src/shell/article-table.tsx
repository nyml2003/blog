import { For } from "solid-js";
import {
  adminArticleEditHref,
  type ContentArticle,
} from "../../../solid/queries";
import { shortDate } from "./format";

/** 管理端工作区文章表：每行进入编辑、可暂存下架。 */
export function WorkspaceArticleTable(props: {
  items: readonly ContentArticle[];
  busyArticleId: number | undefined;
  onRemove: (article: ContentArticle) => void;
}) {
  return (
    <div class="list list-admin">
      <div class="admin-list-head" aria-hidden="true">
        <span>文章</span>
        <span>分类</span>
        <span>标签</span>
        <span>更新时间</span>
        <span>操作</span>
      </div>
      <For each={props.items}>
        {(article) => (
          <article class="admin-row">
            <h3>
              <a href={adminArticleEditHref(article.id)}>
                {article.title || "未命名文章"}
              </a>
            </h3>
            <span>{article.categoryIds.length} 个分类</span>
            <span>{article.tagIds.length} 个标签</span>
            <time>{shortDate(article.updatedAt)}</time>
            <div class="row-actions">
              <a href={adminArticleEditHref(article.id)}>编辑</a>
              <button
                type="button"
                class="link-button danger"
                disabled={props.busyArticleId !== undefined}
                aria-label={`暂存下架《${article.title || "未命名文章"}》`}
                onClick={() => props.onRemove(article)}
              >
                {props.busyArticleId === article.id ? "暂存中..." : "暂存下架"}
              </button>
            </div>
          </article>
        )}
      </For>
    </div>
  );
}
