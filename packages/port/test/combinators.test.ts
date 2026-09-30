import assert from "node:assert/strict";
import test from "node:test";
import { asAsyncPersistence } from "@fluvient-loom/port";

test("asAsyncPersistence lifts any sync port into its async shape", async () => {
  const values = new Map<string, string>();
  const persistence = asAsyncPersistence({
    read: (key) =>
      values.get(key) === undefined
        ? { ok: true, value: undefined }
        : { ok: true, value: values.get(key) },
    write: (key, value) => {
      values.set(key, value);
      return { ok: true, value: undefined };
    },
    remove: (key) => {
      values.delete(key);
      return { ok: true, value: undefined };
    },
  });
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
