import type { ErrorInfo, SerializableResult } from "@fluvient/core";

export interface PersistenceFailure {
  readonly kind: "persistence";
  readonly operation: "read" | "write" | "remove";
  readonly message: string;
  readonly cause?: ErrorInfo;
}

/**
 * 持久化写计划。value 已是序列化结果——序列化不进 Port。
 * version 与 createdAt 是预留字段，本轮存储实现可忽略；
 * 批处理表示方式固定为 `readonly PersistPlan[]`（入口名预留 writeBatch，本轮不落）。
 */
export interface PersistPlan {
  readonly key: string;
  readonly value: string;
  /** 预留：领域版本号，供未来条件写入或 legacy 迁移；存储实现可忽略。 */
  readonly version?: number;
  /** 预留：计划生成时间戳（epoch ms），仅诊断用途；存储实现可忽略。 */
  readonly createdAt?: number;
}

export interface PersistencePort {
  read(key: string): SerializableResult<string | undefined, PersistenceFailure>;
  write(plan: PersistPlan): SerializableResult<void, PersistenceFailure>;
  remove(key: string): SerializableResult<void, PersistenceFailure>;
}

export interface AsyncPersistencePort {
  read(key: string): Promise<SerializableResult<string | undefined, PersistenceFailure>>;
  write(plan: PersistPlan): Promise<SerializableResult<void, PersistenceFailure>>;
  remove(key: string): Promise<SerializableResult<void, PersistenceFailure>>;
}
