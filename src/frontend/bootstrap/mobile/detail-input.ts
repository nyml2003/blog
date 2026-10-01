import { positiveIdFromSearch } from "../../validation/route-input";

export function articleIdFromSearch(search: string): number | undefined {
  return positiveIdFromSearch(search, "id");
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
