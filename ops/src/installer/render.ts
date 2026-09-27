/** 模板占位符替换:发布包保留 `{{serverName}}` / `{{contentRepo}}`,安装时注入。 */
export function renderTemplate(text: string, values: Readonly<Record<string, string>>): string {
  const placeholders = new Set([...text.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g)].map((match) => match[1]!));
  for (const key of placeholders) {
    if (!(key in values)) throw new Error(`模板缺少占位符取值:${key}`);
  }
  let output = text;
  for (const [key, value] of Object.entries(values)) output = output.replaceAll(`{{${key}}}`, value);
  if (/\{\{[a-zA-Z]/.test(output)) throw new Error('模板存在未解析占位符');
  return output;
}
