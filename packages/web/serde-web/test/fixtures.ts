import assert from "node:assert/strict";
import type { Result } from "@fluvient/core";
import type { SerdeFailure, StandardSchemaV1 } from "@fluvient-loom/serde";

/**
 * 手写 Standard Schema 夹具（与 @fluvient-loom/serde 的测试同款，包间不共享测试辅助）：
 * 证明本包的解析器接的是 serde 的结构契约，不绑定任何校验库。
 */
export function schemaOf<Output>(
  validate: StandardSchemaV1.Props<unknown, Output>["validate"],
): StandardSchemaV1<unknown, Output> {
  return { "~standard": { version: 1, vendor: "test", validate } };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function valueOf<T>(result: Result<T, SerdeFailure>): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected a value");
  return result.value;
}

export function failureOf<T>(result: Result<T, SerdeFailure>): SerdeFailure {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a failure");
  return result.error;
}
