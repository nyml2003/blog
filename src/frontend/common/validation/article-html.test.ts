import assert from "node:assert/strict";
import { test } from "node:test";
import { articleHtmlProfileVersion, parseHtmlInspection } from "./article-html";
import { byteOffsetToSelection } from "./article-html";
import { createHtmlInspector } from "./wasm";

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

const validInspection = {
  profileVersion: articleHtmlProfileVersion,
  valid: true,
  diagnostics: [],
};

test("WASM inspector is lazy, caches initialization, and preserves source", async () => {
  let loads = 0;
  const sources: string[] = [];
  const inspect = createHtmlInspector(async () => {
    loads += 1;
    return {
      inspect_html: (source: string) => {
        sources.push(source);
        return JSON.stringify(validInspection);
      },
    };
  });
  const first = inspect("<p>中文</p>");
  assert.equal(loads, 0);
  const results = await Promise.all([
    first.start(),
    inspect("<p>next</p>").start(),
  ]);
  assert.equal(loads, 1);
  assert.deepEqual(sources, ["<p>中文</p>", "<p>next</p>"]);
  assert.ok(results.every((result) => result.ok));
});

test("WASM initialization failure is retryable and malformed results fail closed", async () => {
  let loads = 0;
  const inspect = createHtmlInspector(async () => {
    loads += 1;
    if (loads === 1) throw new Error("load failed");
    return { inspect_html: () => JSON.stringify(validInspection) };
  });
  assert.equal((await inspect("<p>draft</p>").start()).ok, false);
  assert.equal((await inspect("<p>draft</p>").start()).ok, true);
  assert.equal(loads, 2);
  const malformed = createHtmlInspector(async () => ({
    inspect_html: () => '{"valid":true}',
  }));
  assert.equal((await malformed("<script>bad()</script>").start()).ok, false);
});

test("cancelled WASM request never inspects after asynchronous initialization", async () => {
  let finish: (() => void) | undefined;
  let inspected = false;
  const inspect = createHtmlInspector(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return {
      inspect_html: () => {
        inspected = true;
        return JSON.stringify(validInspection);
      },
    };
  });
  const task = inspect("old source");
  const result = task.start();
  await Promise.resolve();
  task.cancel();
  finish?.();
  assert.deepEqual(await result, { ok: false, error: { kind: "cancelled" } });
  assert.equal(inspected, false);
});

test("UTF-8 diagnostics map to UTF-16 textarea selections", () => {
  const source = "a中😀b";
  assert.equal(byteOffsetToSelection(source, 0), 0);
  assert.equal(byteOffsetToSelection(source, 4), 2);
  assert.equal(byteOffsetToSelection(source, 8), 4);
  assert.equal(byteOffsetToSelection(source, 9), 5);
  assert.equal(byteOffsetToSelection("中\r\nx", 5), 2);
  assert.equal(byteOffsetToSelection("中\r\nx", 6), 3);
});
