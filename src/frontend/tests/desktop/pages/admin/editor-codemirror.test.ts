import assert from "node:assert/strict";
import test from "node:test";
import { articleHtmlProfileVersion } from "../../../../common/validation/article-html";
import { htmlDiagnosticsToCodeMirror } from "../../../../desktop/src/pages/admin/editor-codemirror";

test("maps UTF-8 diagnostic byte spans to UTF-16 CodeMirror ranges", () => {
  const source = "<p>中文😀</p>";
  const start = Buffer.from("<p>").byteLength;
  const end = Buffer.from("<p>中文😀").byteLength;
  const diagnostics = htmlDiagnosticsToCodeMirror(source, {
    profileVersion: articleHtmlProfileVersion,
    valid: false,
    diagnostics: [
      {
        code: "HTML_INVALID_TEXT",
        severity: "error",
        message: "invalid text",
        span: {
          start: { byte: start, line: 1, column: 4 },
          end: { byte: end, line: 1, column: 8 },
        },
        profileVersion: articleHtmlProfileVersion,
      },
    ],
  });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].from, 3);
  assert.equal(diagnostics[0].to, 7);
  assert.equal(diagnostics[0].source, "HTML_INVALID_TEXT");
});

test("returns no CodeMirror diagnostics while inspection is pending", () => {
  assert.deepEqual(htmlDiagnosticsToCodeMirror("<p>draft</p>", undefined), []);
});

test("clamps byte spans and follows CodeMirror newline normalization", () => {
  const source = "a中\r\n😀b";
  const diagnostics = htmlDiagnosticsToCodeMirror(source, {
    profileVersion: articleHtmlProfileVersion,
    valid: false,
    diagnostics: [
      {
        code: "HTML_INVALID_TEXT",
        severity: "warning",
        message: "warning",
        span: {
          start: { byte: 0, line: 1, column: 1 },
          end: { byte: 999, line: 2, column: 1 },
        },
        profileVersion: articleHtmlProfileVersion,
      },
    ],
  });
  assert.equal(diagnostics[0].from, 0);
  assert.equal(diagnostics[0].to, "a中\n😀b".length);
});
