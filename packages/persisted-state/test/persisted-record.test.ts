import assert from "node:assert/strict";
import test from "node:test";
import { err, ok } from "@fluvient/core";
import type { PersistencePort } from "@fluvient-loom/port";
import { createPersistedRecord } from "../src/persisted-record.ts";

// 注：单测只验证存储与值语义；signal 到 UI 的传播是 solid 核心行为，
// 浏览器级证据由前端 e2e 覆盖（node 环境下 solid 为 server 构建，effect 不执行）。

interface FakePersistence extends PersistencePort {
  readonly store: Map<string, string>;
}

function fakePersistence(
  options: { readonly failWrite?: boolean; readonly throwWrite?: boolean } = {},
): FakePersistence {
  const store = new Map<string, string>();
  return {
    store,
    read: (key) => ok(store.get(key)),
    write(key, value) {
      if (options.throwWrite === true) {
        throw new Error("injected write exception");
      }
      if (options.failWrite === true) {
        return err({
          kind: "persistence",
          operation: "write",
          message: "injected write failure",
        });
      }
      store.set(key, value);
      return ok(undefined);
    },
    remove: (key) => {
      store.delete(key);
      return ok(undefined);
    },
  };
}

interface TestRecord {
  readonly count: number;
}

const defaultRecord: TestRecord = { count: 0 };

function parseRecord(raw: string | undefined): TestRecord {
  if (raw === undefined) return defaultRecord;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultRecord;
    const count = (parsed as { readonly count?: unknown }).count;
    return typeof count === "number" ? { count } : defaultRecord;
  } catch {
    return defaultRecord;
  }
}

function createTestRecord(persistence: FakePersistence) {
  return createPersistedRecord<TestRecord>(persistence, {
    key: "test.record.v1",
    parse: parseRecord,
    serialize: JSON.stringify,
  });
}

test("initial value comes from storage through parse", () => {
  const persistence = fakePersistence();
  persistence.store.set("test.record.v1", JSON.stringify({ count: 7 }));
  assert.deepEqual(createTestRecord(persistence).value(), { count: 7 });
});

test("missing or corrupt storage falls back to the parse default", () => {
  const empty = createTestRecord(fakePersistence());
  assert.deepEqual(empty.value(), defaultRecord);

  const corrupt = fakePersistence();
  corrupt.store.set("test.record.v1", "{not json");
  assert.deepEqual(createTestRecord(corrupt).value(), defaultRecord);

  const failed = fakePersistence();
  const originalRead = failed.read;
  failed.read = (key) =>
    err({
      kind: "persistence",
      operation: "read",
      message: `injected read failure for ${key}`,
    });
  void originalRead;
  assert.deepEqual(createTestRecord(failed).value(), defaultRecord);
});

test("update with a value writes through to storage", () => {
  const persistence = fakePersistence();
  const record = createTestRecord(persistence);
  assert.equal(record.set({ count: 3 }).ok, true);
  assert.equal(record.set({ count: 5 }).ok, true);
  assert.deepEqual(record.value(), { count: 5 });
  assert.equal(
    persistence.store.get("test.record.v1"),
    JSON.stringify({ count: 5 }),
  );
});

test("update with a function derives the next value from the current one", () => {
  const persistence = fakePersistence();
  const record = createTestRecord(persistence);
  record.update((previous) => ({ count: previous.count + 1 }));
  record.update((previous) => ({ count: previous.count + 1 }));
  assert.deepEqual(record.value(), { count: 2 });
  assert.equal(
    persistence.store.get("test.record.v1"),
    JSON.stringify({ count: 2 }),
  );
});

test("failed write rolls the in-memory value back to storage state", () => {
  const failing = fakePersistence({ failWrite: true });
  failing.store.set("test.record.v1", JSON.stringify({ count: 4 }));
  const record = createTestRecord(failing);
  const result = record.set({ count: 9 });
  assert.equal(result.ok, false);
  assert.deepEqual(record.value(), { count: 4 });
  assert.equal(
    failing.store.get("test.record.v1"),
    JSON.stringify({ count: 4 }),
  );
});

test("a function value is set without being mistaken for an updater", () => {
  const persistence = fakePersistence();
  const record = createPersistedRecord<() => string>(persistence, {
    key: "test.function.v1",
    parse: () => () => "default",
    serialize: () => "function-value",
  });
  const value = () => "stored";
  const result = record.set(value);
  assert.equal(result.ok, true);
  assert.equal(record.value(), value);
});

test("custom equality keeps the existing value when values are equivalent", () => {
  const persistence = fakePersistence();
  const record = createPersistedRecord<TestRecord>(persistence, {
    key: "test.equal.v1",
    parse: parseRecord,
    serialize: JSON.stringify,
    equals: (previous, next) => previous.count === next.count,
  });
  const previous = record.value();
  assert.equal(record.set({ count: previous.count }).ok, true);
  assert.equal(record.value(), previous);
});

test("serialization failure leaves memory unchanged and returns a Result error", () => {
  const persistence = fakePersistence();
  const record = createPersistedRecord<TestRecord>(persistence, {
    key: "test.serialize.v1",
    parse: parseRecord,
    serialize: () => {
      throw new TypeError("cannot serialize");
    },
  });
  const result = record.set({ count: 8 });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, "persisted-record");
  assert.equal(result.error.operation, "serialize");
  assert.deepEqual(record.value(), defaultRecord);
});

test("a thrown persistence write is normalized into a Result error", () => {
  const persistence = fakePersistence({ throwWrite: true });
  const record = createTestRecord(persistence);
  const result = record.set({ count: 8 });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, "persistence");
  assert.equal(result.error.operation, "write");
  assert.deepEqual(record.value(), defaultRecord);
});

test("an updater exception is normalized without changing state", () => {
  const record = createTestRecord(fakePersistence());
  const result = record.update(() => {
    throw new Error("injected updater exception");
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, "persisted-record");
  assert.equal(result.error.operation, "update");
  assert.deepEqual(record.value(), defaultRecord);
});

test("read failures remain observable without replacing the last known value", () => {
  const failing = fakePersistence({ failWrite: true });
  failing.read = () =>
    err({
      kind: "persistence",
      operation: "read",
      message: "injected read failure",
    });
  const record = createTestRecord(failing);
  assert.equal(record.readFailure()?.message, "injected read failure");
  const result = record.set({ count: 2 });
  assert.equal(result.ok, false);
  assert.deepEqual(record.value(), defaultRecord);
});
