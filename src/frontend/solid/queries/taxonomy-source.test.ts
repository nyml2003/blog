import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTaxonomySource, parseTaxonomySource } from "./taxonomy-source";

const taxonomy = {
  version: 1,
  nextCategoryId: 3,
  nextTagId: 2,
  categories: [
    { id: 1, name: "工程", parentId: null, position: 10 },
    { id: 2, name: "Rust", parentId: 1, position: 10 },
  ],
  tags: [{ id: 1, name: "性能" }],
};

test("taxonomy source normalizes root parent null at the HTTP boundary", () => {
  const parsed = parseTaxonomySource(JSON.stringify(taxonomy));
  if (!parsed.ok) assert.fail(parsed.message);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.categories[0]?.parentId, undefined);
  const formatted = formatTaxonomySource(parsed.value);
  assert.match(formatted, /"nextCategoryId": 3/);
  assert.match(formatted, /"parentId": null/);
});

test("taxonomy source reports JSON and schema failures without throwing", () => {
  assert.deepEqual(parseTaxonomySource("{"), {
    ok: false,
    message: "taxonomy JSON 无法解析",
  });
  const missingWatermark = parseTaxonomySource(
    JSON.stringify({ ...taxonomy, nextCategoryId: undefined }),
  );
  assert.equal(missingWatermark.ok, false);
  if (missingWatermark.ok) assert.fail("missing watermark must fail");
  assert.match(missingWatermark.message, /^nextCategoryId:/);
});
