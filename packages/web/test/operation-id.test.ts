import assert from "node:assert/strict";
import test from "node:test";
import { createWebOperationId, uuidV4 } from "@fluvient-loom/web";

test("web operation ids are RFC 4122 v4 UUIDs", () => {
  const operationIds = createWebOperationId();
  const value = operationIds.next();
  assert.match(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(operationIds.next(), value);
});

test("the insecure-context fallback also yields distinct v4 UUIDs", () => {
  const first = uuidV4();
  const second = uuidV4();
  for (const value of [first, second]) {
    assert.match(
      value,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  }
  assert.notEqual(first, second);
});

test("an injected randomUUID source is honoured", () => {
  let counter = 0;
  const operationIds = createWebOperationId({
    randomUUID: () => `web-${++counter}`,
  });
  assert.equal(operationIds.next(), "web-1");
  assert.equal(operationIds.next(), "web-2");
});
