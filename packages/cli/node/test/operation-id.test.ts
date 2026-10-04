import assert from "node:assert/strict";
import test from "node:test";
import { createNodeOperationId } from "@fluvient-loom/node";

test("node operation ids are RFC 4122 v4 UUIDs", () => {
  const operationIds = createNodeOperationId();
  const value = operationIds.next();
  assert.match(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(operationIds.next(), value);
});

test("an injected randomUUID source is honoured", () => {
  let counter = 0;
  const operationIds = createNodeOperationId({
    randomUUID: () => `injected-${++counter}`,
  });
  assert.equal(operationIds.next(), "injected-1");
  assert.equal(operationIds.next(), "injected-2");
});
