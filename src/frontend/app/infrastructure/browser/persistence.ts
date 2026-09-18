import { err, ok } from "../../kernel/result";
import type { PersistenceFailure, PersistencePort } from "../../kernel/ports";

export interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function failure(
  operation: PersistenceFailure["operation"],
  cause: unknown,
): PersistenceFailure {
  return {
    kind: "persistence",
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

export function createBrowserPersistence(
  storage: BrowserStorageLike,
): PersistencePort {
  return {
    read(key) {
      try {
        return ok(storage.getItem(key) ?? undefined);
      } catch (cause) {
        return err(failure("read", cause));
      }
    },
    write(key, value) {
      try {
        storage.setItem(key, value);
        return ok(undefined);
      } catch (cause) {
        return err(failure("write", cause));
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
        return ok(undefined);
      } catch (cause) {
        return err(failure("remove", cause));
      }
    },
  };
}
