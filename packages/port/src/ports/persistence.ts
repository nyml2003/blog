import type { Result } from "@fluvient/core";

export interface PersistenceFailure {
  readonly kind: "persistence";
  readonly operation: "read" | "write" | "remove";
  readonly message: string;
}

export interface PersistencePort {
  read(key: string): Result<string | undefined, PersistenceFailure>;
  write(key: string, value: string): Result<void, PersistenceFailure>;
  remove(key: string): Result<void, PersistenceFailure>;
}

export interface AsyncPersistencePort {
  read(key: string): Promise<Result<string | undefined, PersistenceFailure>>;
  write(key: string, value: string): Promise<Result<void, PersistenceFailure>>;
  remove(key: string): Promise<Result<void, PersistenceFailure>>;
}
