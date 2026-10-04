import type {
  AsyncPersistencePort,
  PersistencePort,
} from "./ports/persistence.ts";

/**
 * Port-level combinator: lifts any synchronous PersistencePort into its
 * async shape. The two ports share method names with incompatible return
 * types, so one object cannot implement both; compose instead.
 */
export function asAsyncPersistence(
  persistence: PersistencePort,
): AsyncPersistencePort {
  return {
    async read(key) {
      return persistence.read(key);
    },
    async write(plan) {
      return persistence.write(plan);
    },
    async remove(key) {
      return persistence.remove(key);
    },
  };
}
