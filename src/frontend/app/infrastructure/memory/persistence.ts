import { ok } from "../../kernel/result";
import type { AsyncPersistencePort, PersistencePort } from "../../kernel/ports";

export function createMemoryPersistence(
  initial: Readonly<Record<string, string>> = {},
): PersistencePort {
  const values = new Map(Object.entries(initial));
  return {
    read(key) {
      return ok(values.get(key));
    },
    write(key, value) {
      values.set(key, value);
      return ok(undefined);
    },
    remove(key) {
      values.delete(key);
      return ok(undefined);
    },
  };
}

export function createMemoryAsyncPersistence(
  initial: Readonly<Record<string, string>> = {},
): AsyncPersistencePort {
  const persistence = createMemoryPersistence(initial);
  return {
    read: async (key) => persistence.read(key),
    write: async (key, value) => persistence.write(key, value),
    remove: async (key) => persistence.remove(key),
  };
}
