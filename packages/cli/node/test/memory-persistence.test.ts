import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryAsyncPersistence,
  createMemoryPersistence,
} from "@fluvient-loom/node";

test("memory persistence round-trips synchronously", () => {
  const persistence = createMemoryPersistence();
  assert.deepEqual(persistence.read("missing"), { ok: true, value: undefined });
  assert.deepEqual(persistence.write("theme", "dark"), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(persistence.read("theme"), { ok: true, value: "dark" });
  assert.deepEqual(persistence.remove("theme"), { ok: true, value: undefined });
  assert.deepEqual(persistence.read("theme"), { ok: true, value: undefined });
});

test("memory persistence seeds from an initial record", () => {
  const persistence = createMemoryPersistence({ theme: "dark" });
  assert.deepEqual(persistence.read("theme"), { ok: true, value: "dark" });
});

test("memory async persistence composes the sync port", async () => {
  const persistence = createMemoryAsyncPersistence({ font: "serif" });
  assert.deepEqual(await persistence.read("font"), {
    ok: true,
    value: "serif",
  });
  assert.deepEqual(await persistence.write("font", "mono"), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await persistence.read("font"), { ok: true, value: "mono" });
  assert.deepEqual(await persistence.remove("font"), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await persistence.read("font"), {
    ok: true,
    value: undefined,
  });
});
