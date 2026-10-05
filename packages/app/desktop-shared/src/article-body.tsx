import { createEffect, onCleanup } from "solid-js";
import {
  clearTextHighlight,
  highlightText,
} from "@fluvient-loom/text-highlight/web";
import "@fluvient-loom/text-highlight/styles.css";

export function ArticleBody(props: {
  readonly html: string;
  readonly query?: string;
}) {
  let root: HTMLDivElement | undefined;
  createEffect(() => {
    const html = props.html;
    const query = props.query?.trim() ?? "";
    if (root === undefined) return;
    root.innerHTML = html;
    if (query === "") {
      clearTextHighlight(root);
      return;
    }
    const session = highlightText(root, query);
    session.focus(0);
    onCleanup(() => session.clear());
  });
  // innerHTML 只由上面的 effect 写入：若 JSX prop 与 effect 双写，长文会在同一帧被解析两遍。
  return (
    <div
      ref={(element) => {
        root = element;
      }}
      class="article-body"
    />
  );
}
