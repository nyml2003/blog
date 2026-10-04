/**
 * JSON 媒介的具体解析器/序列化器，注入 @fluvient-loom/serde 的 decoder/encoder：
 *
 *   decode({ type, source, parser: parseJsonText })
 *   encode({ value, serializer: serializeJson })
 */

/** JSON 文本 → 值。语法错误会抛出，由 decode 归一为 stage "parse" 的失败。 */
export function parseJsonText(text: string): unknown {
  return JSON.parse(text);
}

/** 值 → JSON 文本；返回 undefined 表示不可序列化（如 undefined、函数、Symbol）。 */
export function serializeJson(value: unknown): string | undefined {
  return JSON.stringify(value);
}
