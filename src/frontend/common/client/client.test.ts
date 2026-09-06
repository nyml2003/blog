import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "./client";

test("client builds domain intent requests and rejects invalid response data", async () => {
  const requests: string[] = [];
  const transport = {
    request: async <T>({ path }: { path: string }) => {
      requests.push(path);
      return { ok: true, value: { items: [], total: 0 } } as {
        ok: true;
        value: T;
      };
    },
  };
  const client = createClient(transport);
  assert.deepEqual(
    await client.articleCatalog.listPublishedArticles({ typeId: 2 }).start(),
    { ok: true, value: { items: [], total: 0 } },
  );
  assert.equal(
    requests[0],
    "/api/public/articles?sceneCode=public.article_list&type_id=2",
  );
  const bad = createClient({
    request: async () => ({ ok: true, value: { invalid: true } }) as never,
  }).articleCatalog.listPublishedArticles();
  assert.equal((await bad.start()).ok, false);
});
