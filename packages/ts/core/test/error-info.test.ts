import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isJsonValue,
  isSerializableFailure,
  toErrorInfo,
} from "../src/error-info.ts";

test("toErrorInfo returns a JSON-safe projection of an Error cause chain", () => {
  const root = new Error("read failed", { cause: new TypeError("disk unavailable") });

  const info = toErrorInfo(root);

  assert.deepEqual(info, {
    name: "Error",
    message: "read failed",
    cause: {
      name: "TypeError",
      message: "disk unavailable",
    },
  });
  assert.doesNotThrow(() => JSON.stringify(info));
});

test("toErrorInfo bounds cycles and optionally exposes stack", () => {
  const cyclic: { message: string; cause?: unknown } = { message: "cycle" };
  cyclic.cause = cyclic;

  assert.deepEqual(toErrorInfo(cyclic), {
    name: "ThrownValue",
    message: "cycle",
    cause: {
      name: "CauseCycle",
      message: "Error cause chain contains a cycle",
    },
  });

  assert.equal(toErrorInfo(new Error("hidden stack")).stack, undefined);
  assert.equal(toErrorInfo(new Error("included stack"), { includeStack: true }).stack !== undefined, true);
});

test("isJsonValue rejects values that JSON boundaries cannot safely carry", () => {
  assert.equal(isJsonValue({ ok: true, items: ["ready", 1, null] }), true);
  assert.equal(isJsonValue(Number.NaN), false);
  assert.equal(isJsonValue(new Error("raw error")), false);
  assert.equal(isJsonValue(new Date()), false);

  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.equal(isJsonValue(cyclic), false);
  assert.equal(isSerializableFailure({ kind: "network", message: "offline" }), true);
  assert.equal(isSerializableFailure({ kind: "network", message: new Error("raw") }), false);
  assert.equal(isSerializableFailure({ kind: "cancelled" }), true);
});
