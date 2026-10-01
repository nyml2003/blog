import { ok } from "@fluvient/core";
import type {
  AsyncPersistencePort,
  PersistencePort,
} from "@fluvient-loom/port";
import { asAsyncPersistence } from "@fluvient-loom/port";

/**
 * In-memory persistence: neutral by construction (no host capability at
 * all). Lives here as the Node-side default and test fake; free to migrate
 * into a shared package the day a second host needs it unchanged.
 */
export function createMemoryPersistence(
  initial: Readonly<Record<string, string>> = {},
): PersistencePort {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    read: (key) => ok(store.get(key)),
    write: (key, value) => {
      store.set(key, value);
      return ok(undefined);
    },
    remove: (key) => {
      store.delete(key);
      return ok(undefined);
    },
  };
}

/**
 * In-memory async persistence for hosts and tests that wire the async port
 * shape; composes the sync memory port instead of duplicating it.
 */
export function createMemoryAsyncPersistence(
  initial: Readonly<Record<string, string>> = {},
): AsyncPersistencePort {
  return asAsyncPersistence(createMemoryPersistence(initial));
}
