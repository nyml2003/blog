import { createEffect, onCleanup } from "solid-js";
import { highlightText } from "@fluvient-loom/text-highlight/web";

export interface ArticleBodyProps {
  readonly html: string;
  readonly query?: string;
}

export function ArticleBody(props: ArticleBodyProps) {
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
