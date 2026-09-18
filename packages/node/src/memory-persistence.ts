import { ok } from "@fluvient-loom/common";
import type { PersistencePort } from "@fluvient-loom/port";

/**
 * In-memory persistence: neutral by construction (no host capability at
 * all). Lives here as the Node-side default and test fake; free to migrate
 * into a shared package the day a second host needs it unchanged.
 */
export function createMemoryPersistence(): PersistencePort {
  const store = new Map<string, string>();
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
