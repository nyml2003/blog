export const mobileFavoritesKey = "blog.mobile.favorites.v1";
export type MobileFavorites = Readonly<Record<string, true>>;

export function parseMobileFavorites(raw: unknown): MobileFavorites {
  if (typeof raw !== "string") return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, true] => entry[1] === true));
  } catch { return {}; }
}
