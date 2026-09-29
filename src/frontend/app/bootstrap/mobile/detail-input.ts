export function articleIdFromSearch(search: string): number | undefined {
  const raw = new URLSearchParams(search).get("id");
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) return undefined;
  return id;
}

export function canReturnToSite(
  referrer: string,
  currentOrigin: string,
  historyLength: number,
): boolean {
  if (historyLength <= 1 || referrer === "") return false;
  try {
    return new URL(referrer).origin === currentOrigin;
  } catch {
    return false;
  }
}
