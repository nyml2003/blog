// 极简 hyperscript → HTML 字符串运行时（Node 构建环境，零 DOM 依赖）。
// h("div", {id: "x"}, h("span", null, "text")) → { html: "<div id=\"x\"><span>text</span></div>" }
// 文本子级自动转义；嵌套 h() 结果（Html 包装）不转义。

/** HTML void 元素：无闭合标签，自闭合。 */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** 已渲染的 HTML（嵌套 h() 的返回值，子级拼接时不转义）。 */
export interface Html {
  readonly html: string;
}

type Child = Html | string | number | boolean | null | undefined | readonly Child[];

function flatten(children: readonly Child[]): string {
  let out = "";
  for (const child of children) {
    if (child === null || child === undefined || child === true || child === false) continue;
    if (typeof child === "object" && "html" in child) { out += child.html; continue; }
    if (typeof child === "string") { out += escapeText(child); continue; }
    if (typeof child === "number") { out += escapeText(String(child)); continue; }
    if (Array.isArray(child)) { out += flatten(child); continue; }
  }
  return out;
}

function renderAttrs(props: Record<string, unknown>): string {
  let out = "";
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "dangerouslySetInnerHTML") continue;
    if (value === undefined || value === false || value === null) continue;
    if (value === true) { out += ` ${key}`; continue; }
    out += ` ${key}="${escapeAttr(String(value))}"`;
  }
  return out;
}

export type JsxProps = Record<string, unknown> & {
  children?: Child | readonly Child[];
  dangerouslySetInnerHTML?: string;
};

/** h("meta", {charset: "UTF-8"}) → { html: "<meta charset=\"UTF-8\" />" } */
export function h(tag: string, props: JsxProps | null, ...children: readonly Child[]): Html {
  const inline = props?.children !== undefined ? [props.children as Child] : [];
  const all = [...inline, ...children];
  const raw = props?.dangerouslySetInnerHTML;
  const attrs = renderAttrs(props ?? {});

  if (tag === "fragment") return { html: flatten(all) };
  if (VOID_ELEMENTS.has(tag)) return { html: `<${tag}${attrs} />` };
  if (raw !== undefined) return { html: `<${tag}${attrs}>${raw}</${tag}>` };
  return { html: `<${tag}${attrs}>${flatten(all)}</${tag}>` };
}
