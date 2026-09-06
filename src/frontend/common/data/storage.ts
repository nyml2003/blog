import { err, ok, type Result } from "./result";

export type StorageFailure = {
  readonly kind: "storage-unavailable";
  readonly operation: "read" | "write";
};

export type StorageProvider = () => Pick<Storage, "getItem" | "setItem">;

export type SynchronousStorage = {
  read(key: string): Result<string | undefined, StorageFailure>;
  write(key: string, value: string): Result<void, StorageFailure>;
};

export function createSynchronousStorage(
  provideStorage: StorageProvider,
): SynchronousStorage {
  return {
    read(key) {
      try {
        return ok(provideStorage().getItem(key) ?? undefined);
      } catch {
        return err({ kind: "storage-unavailable", operation: "read" });
      }
    },
    write(key, value) {
      try {
        provideStorage().setItem(key, value);
        return ok(undefined);
      } catch {
        return err({ kind: "storage-unavailable", operation: "write" });
      }
    },
  };
}
