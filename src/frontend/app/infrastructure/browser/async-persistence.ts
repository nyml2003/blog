import type { AsyncPersistencePort, PersistencePort } from "../../kernel/ports";

export function createBrowserAsyncPersistence(
  persistence: PersistencePort,
): AsyncPersistencePort {
  return {
    read: async (key) => persistence.read(key),
    write: async (key, value) => persistence.write(key, value),
    remove: async (key) => persistence.remove(key),
  };
}
