import type { ErrorInfo, SerializableResult } from "@fluvient/core";

export interface PersistenceFailure {
  readonly kind: "persistence";
  readonly operation: "read" | "write" | "remove";
  readonly message: string;
  readonly cause?: ErrorInfo;
}

export interface PersistencePort {
  read(key: string): SerializableResult<string | undefined, PersistenceFailure>;
  write(key: string, value: string): SerializableResult<void, PersistenceFailure>;
  remove(key: string): SerializableResult<void, PersistenceFailure>;
}

export interface AsyncPersistencePort {
  read(key: string): Promise<SerializableResult<string | undefined, PersistenceFailure>>;
  write(key: string, value: string): Promise<SerializableResult<void, PersistenceFailure>>;
  remove(key: string): Promise<SerializableResult<void, PersistenceFailure>>;
}
