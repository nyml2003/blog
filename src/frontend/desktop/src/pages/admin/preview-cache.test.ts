import assert from "node:assert/strict";
import { test } from "node:test";
import { readPreviewDraft } from "./preview-cache";

test("preview storage is schema-checked and scoped to the requested article", () => {
  const article = {
    id: 3,
    title: "draft",
    summary: "",
    articleTypeId: 1,
    contentHtml: "<script>untrusted()</script>",
    status: "draft",
    createdAt: "",
    updatedAt: "",
    termIds: [],
  };
  assert.equal(
    readPreviewDraft(JSON.stringify(article), "3")?.contentHtml,
    article.contentHtml,
  );
  assert.equal(readPreviewDraft(JSON.stringify(article), "4"), undefined);
  assert.equal(readPreviewDraft(JSON.stringify(article), null), undefined);
  assert.equal(readPreviewDraft('{"id":3}', "3"), undefined);
  assert.equal(readPreviewDraft("not json", "3"), undefined);
  assert.equal(
    readPreviewDraft(
      JSON.stringify({ ...article, id: 0, articleTypeId: 0 }),
      null,
    )?.id,
    0,
  );
});
