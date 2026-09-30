import assert from "node:assert/strict";
import test from "node:test";
import { createWebSpaceTime } from "@fluvient-loom/web";

test("web space-time returns the injected clock", () => {
  const port = createWebSpaceTime({ now: () => 123 });
  assert.equal(port.now(), 123);
});

test("web space-time defaults to the wall clock", () => {
  const port = createWebSpaceTime();
  const before = Date.now();
  const value = port.now();
  const after = Date.now();
  assert.ok(value >= before && value <= after);
});
