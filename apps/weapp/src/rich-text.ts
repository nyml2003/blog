export type WeappRichTextNode =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly name: string;
      readonly attrs?: Readonly<Record<string, string>>;
      readonly children?: readonly WeappRichTextNode[];
    };

const TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "code",
  "pre", "blockquote", "ul", "ol", "li", "a", "br",
]);
const VOID_TAGS = new Set(["br"]);
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
};

export interface RichTextResult {
  readonly nodes: readonly WeappRichTextNode[];
  readonly links: readonly string[];
}

function decodeText(value: string): string {
  return value.replace(/&(#(?:x[0-9a-fA-F]+|[0-9]+)|[a-z]+);/g, (full, key: string) => {
    if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    const decoded = ENTITIES[key];
    if (decoded === undefined) throw new Error("文章包含未知实体");
    return decoded;
  });
}

function attrsFor(tag: string, source: string): Readonly<Record<string, string>> | undefined {
  const attrs: Record<string, string> = {};
  const pattern = /([a-z][a-z0-9-]*)\s*=\s*"([^"]*)"/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (source.slice(cursor, match.index).trim() !== "") throw new Error("文章属性格式无效");
    cursor = pattern.lastIndex;
    if (attrs[match[1]] !== undefined) throw new Error("文章包含重复属性");
    attrs[match[1]] = decodeText(match[2]);
  }
  if (source.slice(cursor).trim() !== "") throw new Error("文章属性格式无效");
  const allowed = tag === "a" ? new Set(["href", "target", "rel"]) : new Set<string>();
  for (const key of Object.keys(attrs)) if (!allowed.has(key)) throw new Error("文章包含不支持的属性");
  if (tag === "a") {
    const href = attrs.href;
    if (href === undefined || !/^https?:\/\//.test(href)) throw new Error("文章链接地址无效");
    if (attrs.target !== "_blank" || attrs.rel === undefined) throw new Error("文章链接属性不完整");
  }
  return Object.keys(attrs).length === 0 ? undefined : attrs;
}

export function articleHtmlToRichText(source: string): RichTextResult {
  if (/<\/?[A-Z]/.test(source)) throw new Error("文章标签名必须使用小写");
  const roots: WeappRichTextNode[] = [];
  const stack: Array<{ tag: string; node: Extract<WeappRichTextNode, { name: string }>; children: WeappRichTextNode[] }> = [];
  const links: string[] = [];
  const append = (node: WeappRichTextNode): void => {
    const parent = stack.at(-1);
    if (parent) parent.children.push(node); else roots.push(node);
  };
  let cursor = 0;
  const token = /<!--|<\/?[a-z][^>]*>|&(?:#(?:x[0-9a-fA-F]+|[0-9]+)|[a-z]+);/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(source)) !== null) {
    if (match.index > cursor) append({ type: "text", text: decodeText(source.slice(cursor, match.index)) });
    const raw = match[0];
    if (raw === "<!--") throw new Error("文章包含不支持的注释");
    if (raw.startsWith("&")) { append({ type: "text", text: decodeText(raw) }); cursor = token.lastIndex; continue; }
    const closing = raw.startsWith("</");
    const body = raw.slice(closing ? 2 : 1, -1);
    if (body.endsWith("/")) throw new Error("文章不允许自闭合标签");
    const parts = body.trim().split(/\s+/, 2);
    const tag = parts[0];
    if (!TAGS.has(tag)) throw new Error("文章包含不支持的元素");
    if (closing) {
      const open = stack.pop();
      if (!open || open.tag !== tag) throw new Error("文章标签嵌套不匹配");
      cursor = token.lastIndex;
      continue;
    }
    const parentTag = stack.at(-1)?.tag;
    if (tag === "li" && parentTag !== "ul" && parentTag !== "ol") throw new Error("文章列表嵌套无效");
    if (tag === "p" && (parentTag === "p" || parentTag === "ul" || parentTag === "ol")) throw new Error("文章块级嵌套无效");
    if (tag === "a" && stack.some((entry) => entry.tag === "a")) throw new Error("文章链接嵌套无效");
    const node = { name: tag, attrs: attrsFor(tag, body.slice(tag.length).trim()), children: [] as WeappRichTextNode[] };
    if (tag === "a") links.push(node.attrs?.href ?? "");
    append(node);
    if (!VOID_TAGS.has(tag)) stack.push({ tag, node, children: node.children });
    cursor = token.lastIndex;
  }
  if (cursor < source.length) append({ type: "text", text: decodeText(source.slice(cursor)) });
  if (stack.length > 0) throw new Error("文章标签未闭合");
  return { nodes: roots, links };
}
