import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { articleHtmlToRichText } = createRequire(import.meta.url)(
  "../../../target/weapp-test/lib/rich-text.cjs",
);

test("article-html/v1 is converted to native rich-text nodes", () => {
  const result = articleHtmlToRichText(
    '<h2>问题定位</h2><p>记录 &lt;输入&gt;。<a href="https://example.com/docs?q=rust&amp;lang=zh" target="_blank" rel="noopener noreferrer">参考资料</a></p>',
  );
  assert.equal(result.nodes.length, 2);
  assert.deepEqual(result.links, [
    "https://example.com/docs?q=rust&lang=zh",
  ]);
  assert.equal(result.nodes[1].name, "p");
});

test("invalid article HTML is rejected before it reaches rich-text", () => {
  for (const source of [
    "<script>alert(1)</script>",
    "<li>root item</li>",
    "<p>unclosed",
    '<a href="javascript:alert(1)" target="_blank" rel="noopener">bad</a>',
  ]) {
    assert.throws(() => articleHtmlToRichText(source), source);
  }
});
