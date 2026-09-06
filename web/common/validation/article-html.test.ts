import assert from "node:assert/strict";
import { test } from "node:test";
import { articleHtmlProfileVersion, parseHtmlInspection } from "./article-html";

const span = {
  start: { byte: 0, line: 1, column: 1 },
  end: { byte: 3, line: 1, column: 4 },
};

test("parses the shared inspection schema without changing diagnostics", () => {
  const inspection = parseHtmlInspection({
    profileVersion: articleHtmlProfileVersion,
    valid: false,
    diagnostics: [
      {
        code: "HTML_CLASS_FORBIDDEN",
        severity: "error",
        message: "正文禁止 class 属性",
        span,
        profileVersion: articleHtmlProfileVersion,
      },
    ],
  });

  assert.equal(inspection.diagnostics[0]?.span.start.byte, 0);
  assert.equal(inspection.diagnostics[0]?.code, "HTML_CLASS_FORBIDDEN");
});

test("rejects an unknown code or profile version at the WASM boundary", () => {
  assert.throws(() =>
    parseHtmlInspection({
      profileVersion: "article-html/v2",
      valid: false,
      diagnostics: [],
    }),
  );
  assert.throws(() =>
    parseHtmlInspection({
      profileVersion: articleHtmlProfileVersion,
      valid: false,
      diagnostics: [
        {
          code: "HTML_NEW_CODE",
          severity: "error",
          message: "unknown",
          span,
          profileVersion: articleHtmlProfileVersion,
        },
      ],
    }),
  );
});

test("rejects inconsistent validity and reversed source spans", () => {
  assert.throws(() =>
    parseHtmlInspection({
      profileVersion: articleHtmlProfileVersion,
      valid: true,
      diagnostics: [
        {
          code: "HTML_CLASS_FORBIDDEN",
          severity: "error",
          message: "正文禁止 class 属性",
          span,
          profileVersion: articleHtmlProfileVersion,
        },
      ],
    }),
  );
  assert.throws(() =>
    parseHtmlInspection({
      profileVersion: articleHtmlProfileVersion,
      valid: false,
      diagnostics: [
        {
          code: "HTML_INVALID_NAME",
          severity: "error",
          message: "invalid",
          span: {
            start: { byte: 4, line: 1, column: 5 },
            end: { byte: 2, line: 1, column: 3 },
          },
          profileVersion: articleHtmlProfileVersion,
        },
      ],
    }),
  );
});
