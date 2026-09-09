/** 文章正文容器：渲染服务端下发并经校验的 HTML。 */
export function ArticleBody(p: { html: string }) {
  return <div class="article-body" innerHTML={p.html} />;
}
