import assert from "node:assert/strict";
import type { Result } from "@fluvient/core";
import type { SerdeFailure } from "../src/index.ts";
import type { StandardSchemaV1 } from "../src/standard-schema.ts";

/**
 * 手写 Standard Schema 夹具：serde 的测试不引入任何校验库依赖，
 * 这本身也证明接口只认结构、不认实现。
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
