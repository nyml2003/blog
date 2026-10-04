import assert from "node:assert/strict";
import test from "node:test";
import { decoder } from "@fluvient-loom/serde";
import { parseJsonText, serializeJson } from "../src/index.ts";
import { failureOf, isRecord, schemaOf, valueOf } from "./fixtures.ts";

const idSchema = schemaOf<{ id: number }>((value) => {
  if (!isRecord(value) || typeof value.id !== "number") {
    return { issues: [{ message: "id must be a number", path: ["id"] }] };
  }
  return { value: { id: value.id } };
});

test("parseJsonText round-trips JSON text", () => {
  assert.deepEqual(parseJsonText('{"id":7}'), { id: 7 });
});

test("parseJsonText throws on invalid JSON; decode maps it to stage parse", () => {
  assert.throws(() => parseJsonText("{ not json"), SyntaxError);

  const failure = failureOf(
    decoder.decode({ type: idSchema, source: "{ not json", parser: parseJsonText }),
  );
  assert.equal(failure.stage, "parse");
  assert.equal(failure.cause?.name, "SyntaxError");
});

test("serializeJson returns text, or undefined for non-serializable values", () => {
  assert.equal(serializeJson({ id: 7 }), '{"id":7}');
  assert.equal(serializeJson(undefined), undefined);
});

test("parseJsonText plugs into serde's decoder", () => {
  const decoded = valueOf(
    decoder.decode({ type: idSchema, source: '{"id":7}', parser: parseJsonText }),
  );
  assert.deepEqual(decoded, { id: 7 });
});
