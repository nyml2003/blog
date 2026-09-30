import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  initSync,
  inspect_html,
} from "../../app/habitat/validation/generated/article_html_wasm.js";

const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "../../../../src/core/article-html-core/tests/fixtures/article-html-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const sources = fixtures.cases.map((entry) => entry.source);
sources.push(
  "<p>中🙂\n&amp;&bad;</p>",
  "<p></p>".repeat(20000),
  "<p></p>".repeat(20001),
  "<blockquote>".repeat(65),
  "x".repeat(262145),
  `<p>${"x".repeat(65529)}</p>`.repeat(4),
);
for (let size = 0; size < 128; size += 1) {
  sources.push(`<p>${"中🙂&amp;".repeat(size)}<code>${size}</code></p>`);
  sources.push(`<p>${"中🙂&amp;".repeat(size)}</wrong>`);
}

const native = spawnSync(
  "cargo",
  [
    "run",
    "--quiet",
    "--locked",
    "--manifest-path",
    "src/Cargo.toml",
    "-p",
    "article-html-core",
    "--example",
    "inspect",
  ],
  {
    cwd: workspace,
    encoding: "utf8",
    input: JSON.stringify(sources),
    maxBuffer: 4 * 1024 * 1024,
  },
);
assert.equal(native.status, 0, native.stderr);
const expected = JSON.parse(native.stdout);
initSync({
  module: readFileSync(
    new URL(
      "../../app/habitat/validation/generated/article_html_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
});
const actual = sources.map((source) => JSON.parse(inspect_html(source)));
assert.deepEqual(actual, expected);
for (const [index, entry] of fixtures.cases.entries()) {
  assert.equal(actual[index].valid, entry.valid, entry.id);
}
console.log(
  `Native/WASM parity: ${sources.length} cases, including exact diagnostic spans and resource boundaries`,
);
