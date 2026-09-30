export function ArticleBody(props: { readonly html: string }) {
  return <div class="article-body" innerHTML={props.html} />;
}
