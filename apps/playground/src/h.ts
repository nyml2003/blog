/**
 * Tiny hyperscript helper: build DOM programmatically and keep element
 * references as plain variables — no template strings to parse, no
 * querySelector to hunt slots, text children are escaped by construction.
 */
export type HAttrs = {
  class?: string;
  dataset?: Record<string, string>;
} & Record<string, unknown>;

export type HChild = Node | string | null | undefined;

export function h(
  tag: string,
  attrs?: HAttrs | null,
  ...children: readonly HChild[]
): HTMLElement {
  const element = document.createElement(tag);
  if (attrs !== undefined && attrs !== null) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) continue;
      if (key === "class") {
        element.className = String(value);
      } else if (key === "dataset") {
        Object.assign(element.dataset, value as Record<string, string>);
      } else if (key.startsWith("on")) {
        element.addEventListener(
          key.slice(2).toLowerCase(),
          value as EventListener,
        );
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    element.append(child);
  }
  return element;
}
