export function positiveIdFromSearch(
  search: string,
  parameter: string,
): number | undefined {
  const raw = new URLSearchParams(search).get(parameter);
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function positiveFilterIdFromSearch(
  search: string,
  parameter: string,
): string {
  const raw = new URLSearchParams(search).get(parameter);
  return raw !== null && /^\d+$/.test(raw) && Number(raw) > 0 ? raw : "all";
}

export function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
