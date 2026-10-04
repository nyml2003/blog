import assert from "node:assert/strict";
import test from "node:test";
import { decoder } from "@fluvient-loom/serde";
import { parseQueryString, withSearchParams } from "../src/index.ts";
import { failureOf, isRecord, schemaOf, valueOf } from "./fixtures.ts";

const idSchema = schemaOf<{ id: number }>((value) => {
  if (!isRecord(value)) {
    return { issues: [{ message: "expected an object" }] };
  }
  const raw = value.id;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    return { issues: [{ message: "必须是正整数", path: ["id"] }] };
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { issues: [{ message: "必须是正整数", path: ["id"] }] };
  }
  return { value: { id } };
});

const decodeId = (source: string | URL) =>
  decoder.decode({ type: idSchema, source, parser: parseQueryString });

test("parses query strings with or without a leading ? and URL instances", () => {
  assert.deepEqual(valueOf(decodeId("?id=7")), { id: 7 });
  assert.deepEqual(valueOf(decodeId("id=7")), { id: 7 });
  assert.deepEqual(
    valueOf(decodeId(new URL("https://example.com/detail?id=7"))),
    { id: 7 },
  );
});

test("repeated keys keep the first value, matching URLSearchParams.get", () => {
  assert.deepEqual(valueOf(decodeId("?id=1&id=2")), { id: 1 });
});

test("missing values land on the schema's defaults", () => {
  const filterSchema = schemaOf<{ filter: string }>((value) => {
    const filter =
      isRecord(value) && typeof value.filter === "string" && value.filter !== ""
        ? value.filter
        : "all";
    return { value: { filter } };
  });
  const decodeFilter = (source: string) =>
    decoder.decode({ type: filterSchema, source, parser: parseQueryString });

  assert.deepEqual(valueOf(decodeFilter("")), { filter: "all" });
  assert.deepEqual(valueOf(decodeFilter("?type_id=3")), { filter: "all" });
  assert.deepEqual(valueOf(decodeFilter("?filter=hot")), { filter: "hot" });
});

test("rejections surface as decode/validate failures with issues", () => {
  const failure = failureOf(decodeId("?id=abc"));

  assert.equal(failure.operation, "decode");
  assert.equal(failure.stage, "validate");
  assert.deepEqual(failure.issues, ["id: 必须是正整数"]);
  assert.equal(failure.message, "id: 必须是正整数");
});

test("Object.prototype pollution cannot leak into the parsed record", () => {
  Object.defineProperty(Object.prototype, "id", {
    value: "7",
    configurable: true,
    writable: true,
  });
  try {
    // 记录原型为 null：即使环境被污染，缺席的 id 也不会经原型链被读出来。
    const failure = failureOf(decodeId(""));
    assert.equal(failure.stage, "validate");
  } finally {
    Reflect.deleteProperty(Object.prototype, "id");
  }
});

test("withSearchParams appends encoded parameters and skips undefined/empty", () => {
  assert.equal(withSearchParams("/detail", { id: 7 }), "/detail?id=7");
  assert.equal(
    withSearchParams("/detail", { id: undefined, q: "", type_id: "all" }),
    "/detail?type_id=all",
  );
  assert.equal(withSearchParams("/detail", { q: "a b&c" }), "/detail?q=a+b%26c");
  assert.equal(withSearchParams("/detail", {}), "/detail");
});

test("withSearchParams output feeds back through the decoder", () => {
  const href = withSearchParams("/detail", { id: 7, extra: "x" });
  assert.deepEqual(
    valueOf(decodeId(new URL(href, "https://example.invalid"))),
    { id: 7 },
  );
});

test("a path string is a query string, not a path: full URLs go through URL instances", () => {
  // 字符串一律按查询串解释；路径/完整 URL 传 URL 实例或调用方自行取 url.search。
  const failure = failureOf(decodeId("/detail?id=7"));
  assert.equal(failure.stage, "validate");
});
