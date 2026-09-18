import { err, ok } from "@fluvient-loom/common";
import type {
  PersistenceFailure,
  PersistencePort,
} from "@fluvient-loom/port";

export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebPersistenceOptions {
  /** Web-standard `localStorage`. Inject to override or fake in tests. */
  readonly storage?: WebStorageLike;
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

export function createWebPersistence(
  options: WebPersistenceOptions = {},
): PersistencePort {
  const storage =
    options.storage ??
    (typeof localStorage === "undefined" ? undefined : localStorage);
  if (storage === undefined) {
    throw new Error(
      "createWebPersistence: 全局 localStorage 不存在，须显式注入 options.storage",
    );
  }
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
