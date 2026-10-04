/**
 * search-params 媒介的具体解析器与写侧工具。
 *
 * 解析器语义：
 * - 字符串按查询串解释（前导 "?" 由 URLSearchParams 剥离）；完整 URL / 路径请传
 *   URL 实例（或调用方自行取 url.search）。
 * - 重复 key first-wins，对齐 URLSearchParams.get 的既有语义。
 * - 记录原型为 null：防止被污染的环境（Object.prototype 上的注入）经原型链渗入
 *   边界记录——校验器用属性访问读取，会走原型链。宿主需要别的策略时整体替换本解析器。
 */
export function parseQueryString(source: string | URL): Record<string, string> {
  const params =
    typeof source === "string" ? new URLSearchParams(source) : source.searchParams;
  const record: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    if (!Object.hasOwn(record, key)) record[key] = value;
  }
  return record;
}

/**
 * 把参数追加到路径上：undefined 与空串跳过（与 desktop-api requestPath 的既有规则一致）。
 * 追加而非合并——path 不应自带查询串。写方向无法由 schema 驱动（Standard Schema
 * 没有内省能力），因此保持独立纯函数，不套 Encoder。
 */
export function withSearchParams(
  path: string,
  parameters: Readonly<Record<string, string | number | undefined>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query === "" ? path : `${path}?${query}`;
}
