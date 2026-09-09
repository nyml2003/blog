/**
 * Desktop 壳层通用格式化工具（A 形态：多导出、成员彼此独立）。
 */

export const qs = () => new URLSearchParams(location.search);

export const date = (value?: string) =>
  value ? new Date(value).toLocaleString() : "-";

export const shortDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "-";
