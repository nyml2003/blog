import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_CATEGORY_SHELF_ENDPOINT,
  isMobileHomePath,
  resolveCategoryShelfUrls,
} from "../../../bootstrap/mobile-prefetch-plan";

function fetchReturning(response: {
  readonly ok: boolean;
  readonly status: number;
  readonly json?: () => Promise<unknown>;
}): typeof fetch {
  return (async () => response) as unknown as typeof fetch;
}

test("home path check accepts exactly /m and /m/", () => {
  assert.equal(isMobileHomePath("/m"), true);
  assert.equal(isMobileHomePath("/m/"), true);
  assert.equal(isMobileHomePath("/m/articles/index.html"), false);
  assert.equal(isMobileHomePath("/"), false);
});

test("resolves category shelf ids into prefetch URLs with matching query order", async () => {
  const urls = await resolveCategoryShelfUrls({
    fetch: fetchReturning({
      ok: true,
      status: 200,
      json: async () => ({
        data: { taxonomy: { categories: [{ id: 3 }, { id: 7 }] } },
      }),
    }),
  });
  assert.deepEqual(urls, [
    `${MOBILE_CATEGORY_SHELF_ENDPOINT}?sceneCode=public.mobile_category_shelf&category_id=3`,
    `${MOBILE_CATEGORY_SHELF_ENDPOINT}?sceneCode=public.mobile_category_shelf&category_id=7`,
  ]);
});

test("malformed bodies degrade to an empty list, invalid ids are filtered", async () => {
  assert.deepEqual(
    await resolveCategoryShelfUrls({
      fetch: fetchReturning({ ok: true, status: 200, json: async () => ({}) }),
    }),
    [],
  );
  assert.deepEqual(
    await resolveCategoryShelfUrls({
      fetch: fetchReturning({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            taxonomy: {
              categories: [
                { id: 0 },
                { id: -1 },
                { id: 1.5 },
                { id: "2" },
                { name: "no id" },
                { id: 4 },
              ],
            },
          },
        }),
      }),
    }),
    [
      `${MOBILE_CATEGORY_SHELF_ENDPOINT}?sceneCode=public.mobile_category_shelf&category_id=4`,
    ],
  );
});

test("a non-ok response rejects so the orchestrator can mark failed", async () => {
  await assert.rejects(
    resolveCategoryShelfUrls({
      fetch: fetchReturning({ ok: false, status: 503 }),
    }),
    /HTTP 503/,
  );
});
