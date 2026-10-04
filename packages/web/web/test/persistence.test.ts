import assert from "node:assert/strict";
import test from "node:test";
import { createWebPersistence } from "@fluvient-loom/web";

function fakeStorage(options: { throwOn?: "read" | "write" | "remove" } = {}) {
  const store = new Map<string, string>();
  const maybeThrow = (op: "read" | "write" | "remove") => {
    if (options.throwOn === op) throw new Error("storage denied");
  };
  return {
    store,
    storage: {
      getItem: (key: string) => {
        maybeThrow("read");
        return store.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        maybeThrow("write");
        store.set(key, value);
      },
      removeItem: (key: string) => {
        maybeThrow("remove");
        store.delete(key);
      },
    },
  };
}

test("web persistence round-trips through an injected storage", () => {
  const fake = fakeStorage();
  const persistence = createWebPersistence({ storage: fake.storage });
  assert.deepEqual(persistence.read("missing"), { ok: true, value: undefined });
  assert.deepEqual(persistence.write({ key: "theme", value: "dark" }), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(persistence.read("theme"), { ok: true, value: "dark" });
  assert.deepEqual(persistence.remove("theme"), { ok: true, value: undefined });
  assert.deepEqual(persistence.read("theme"), { ok: true, value: undefined });
});

test("storage exceptions settle as typed persistence failures", () => {
  for (const op of ["read", "write", "remove"] as const) {
    const persistence = createWebPersistence({
      storage: fakeStorage({ throwOn: op }).storage,
    });
    const result =
      op === "read"
        ? persistence.read("k")
        : op === "write"
          ? persistence.write({ key: "k", value: "v" })
          : persistence.remove("k");
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.error.kind, "persistence");
    assert.equal(result.error.operation, op);
    assert.equal(result.error.message, "storage denied");
  }
});

test("constructing without any storage available fails eagerly", () => {
  assert.throws(() => createWebPersistence(), /localStorage/);
});
