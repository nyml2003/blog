// 本应用的预取计划：哪些页面参与、预取哪些 URL。
// 预取 URL 必须与 mobile-api 页面请求逐字节一致（SW 以完整请求 URL 作缓存键），
// 因此与 @blog/mobile-api 使用同一构造机制（URLSearchParams，插入序
// sceneCode → category_id）。解析刻意保持宽松（形状收窄而非 zod 严格校验）：
// 轻微协议偏差时宁可失败计数（failed/0），不可把坏数据标成成功。

export const MOBILE_CATEGORY_SHELF_ENDPOINT =
  "/api/public/mobile/category-shelf";
const SCENE_CODE = "public.mobile_category_shelf";

export function isMobileHomePath(pathname: string): boolean {
  return pathname === "/m" || pathname === "/m/";
}

/**
 * 注入的 fetch 必须已绑定（如 `window.fetch.bind(window)`）：window.fetch 对
 * this 敏感，解引用后调用（deps.fetch(...)）会抛 Illegal invocation。
 */
export async function resolveCategoryShelfUrls(deps: {
  readonly fetch: typeof fetch;
}): Promise<readonly string[]> {
  const endpoint = `${MOBILE_CATEGORY_SHELF_ENDPOINT}?${new URLSearchParams({
    sceneCode: SCENE_CODE,
  })}`;
  const response = await deps.fetch(endpoint, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`category shelf 请求失败：HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  return categoryIds(body).map(
    (id) =>
      `${MOBILE_CATEGORY_SHELF_ENDPOINT}?${new URLSearchParams({
        sceneCode: SCENE_CODE,
        category_id: String(id),
      })}`,
  );
}

function categoryIds(body: unknown): readonly number[] {
  if (typeof body !== "object" || body === null) return [];
  const d = (body as { data?: unknown }).data;
  if (typeof d !== "object" || d === null) return [];
  const t = (d as { taxonomy?: unknown }).taxonomy;
  if (typeof t !== "object" || t === null) return [];
  const cs = (t as { categories?: unknown }).categories;
  if (!Array.isArray(cs)) return [];
  return cs.flatMap((c) => {
    if (typeof c !== "object" || c === null) return [];
    const id = (c as { id?: unknown }).id;
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0
      ? [id]
      : [];
  });
}
