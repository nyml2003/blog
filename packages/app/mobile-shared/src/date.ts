/** 展示日期：解析失败回退 "-"（原 @blog/route-input 的 displayDate，仅 mobile 使用）。 */
export function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
