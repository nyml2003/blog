import { createEffect, onCleanup } from "solid-js";
import { highlightText, clearTextHighlight } from "@fluvient-loom/text-highlight/web";

export function ArticleBody(props: { readonly html: string; readonly query?: string }) {
  let root: HTMLDivElement | undefined;
  createEffect(() => {
    const query = props.query?.trim() ?? "";
    if (root === undefined || query === "") return;
    const session = highlightText(root, query);
    session.focus(0);
    onCleanup(() => session.clear());
  });
  return <div ref={root} class="article-body" innerHTML={props.html} />;
}
