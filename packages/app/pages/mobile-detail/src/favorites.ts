import {
  createPersistedRecord,
  type PersistedRecordResult,
} from "@fluvient-loom/persisted-state";
import type { PersistencePort } from "@fluvient-loom/port";

export const mobileFavoritesKey = "blog.mobile.favorites.v1";

/** 单文档存储：`PersistencePort` 无枚举能力，收藏必须收敛为一个可整体校验的 JSON 文档。 */
export type MobileFavorites = Readonly<Record<string, true>>;

export const defaultMobileFavorites: MobileFavorites = {};

/** 边界归一化：缺数据、损坏数据、含非 `true` 值的文档都归一到可用状态，永不抛错。 */
export function parseMobileFavorites(raw: string | undefined): MobileFavorites {
  if (raw === undefined) return defaultMobileFavorites;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return defaultMobileFavorites;
    }
    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, true] => entry[1] === true,
    );
    if (entries.length === 0) return defaultMobileFavorites;
    return Object.fromEntries(entries);
  } catch {
    return defaultMobileFavorites;
  }
}

/**
 * 收藏 store：页面 bootstrap 同步创建（app scope），组件只消费状态与领域动词，
 * 不接触持久化细节。
 */
export interface FavoriteStore {
  readonly has: (articleId: string) => boolean;
  readonly toggle: (articleId: string) => PersistedRecordResult<void>;
}

export function createFavoriteStore(
  persistence: PersistencePort,
): FavoriteStore {
  const record = createPersistedRecord<MobileFavorites>(persistence, {
    key: mobileFavoritesKey,
    parse: parseMobileFavorites,
    serialize: JSON.stringify,
  });
  return {
    has: (articleId) => record.value()[articleId] === true,
    toggle: (articleId) => {
      return record.update((current) => {
        const next: Record<string, true> = { ...current };
        if (next[articleId] === true) delete next[articleId];
        else next[articleId] = true;
        return next;
      });
    },
  };
}
