import assert from "node:assert/strict";
import test from "node:test";
import { asAsyncPersistence } from "@fluvient-loom/port";
import { createMemoryPersistence } from "@fluvient-loom/node";

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

test("asAsyncPersistence lifts any sync port into its async shape", async () => {
  const persistence = asAsyncPersistence(createMemoryPersistence());
  assert.deepEqual(await persistence.write("font", "serif"), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await persistence.read("font"), { ok: true, value: "serif" });
  assert.deepEqual(await persistence.remove("font"), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await persistence.read("font"), {
    ok: true,
    value: undefined,
  });
});
