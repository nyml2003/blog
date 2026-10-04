import {
  type ErrorInfo,
  err,
  ok,
  type Result,
  toErrorInfo,
} from "@fluvient/core";
import type { PersistenceFailure, PersistencePort } from "@fluvient-loom/port";
import { createSignal } from "solid-js";

export interface PersistedRecordOptions<T> {
  /** 存储键；命名遵循业务域约定（如 `blog.mobile.<domain>.v1`）。 */
  readonly key: string;
  /**
   * 边界归一化：把存储原始值转换为领域值。
   * 契约：缺数据、损坏数据都必须返回可用默认值，永不抛错。
   */
  readonly parse: (raw: string | undefined) => T;
  readonly serialize: (value: T) => string;
  /** 可选的领域相等比较；判等时保留旧引用并跳过 signal 通知。 */
  readonly equals?: (previous: T, next: T) => boolean;
}

export interface PersistedRecordFailure {
  readonly kind: "persisted-record";
  readonly operation: "serialize" | "update";
  readonly message: string;
  readonly cause?: ErrorInfo;
}

export type PersistedRecordResult<T> = Result<
  T,
  PersistedRecordFailure | PersistenceFailure
>;

export interface PersistedRecord<T> {
  /** 返回值按不可变数据使用；修改请通过 set/update 提交。 */
  readonly value: () => T;
  /** 初始读取或回滚读取的存储错误；缺数据和 parse 归一化不会产生该错误。 */
  readonly readFailure: () => PersistenceFailure | undefined;
  /** 写入一个具体值；写入成功后才更新内存 signal。 */
  readonly set: (next: T) => PersistedRecordResult<void>;
  /** 基于当前值计算并写入下一个值。T 可以安全地是函数类型。 */
  readonly update: (updater: (previous: T) => T) => PersistedRecordResult<void>;
}

/**
 * 同步持久化记录：创建时读一次存储，之后内存 signal 为读路径，
 * set/update 为唯一写路径并写透传存储；写成功后才更新内存，
 * 写失败时尝试回读存储并把失败返回给调用方。
 *
 * 使用前提：必须在页面 bootstrap 中同步创建（app scope）。
 * 禁止在依赖异步 props 或资源的组件内创建——那会把初始化时序变成 bug
 * （signal 初值只求值一次，迟到的事件不会触发重读）。
 */
export function createPersistedRecord<T>(
  persistence: PersistencePort,
  options: PersistedRecordOptions<T>,
): PersistedRecord<T> {
  let lastReadFailure: PersistenceFailure | undefined;

  const read = (): T => {
    try {
      const result = persistence.read(options.key);
      if (!result.ok) {
        lastReadFailure = result.error;
        return options.parse(undefined);
      }
      lastReadFailure = undefined;
      return options.parse(result.value);
    } catch (cause: unknown) {
      const failure: PersistenceFailure = {
        kind: "persistence",
        operation: "read",
        message: "Persistence read threw an exception",
        cause: toErrorInfo(cause),
      };
      lastReadFailure = failure;
      return options.parse(undefined);
    }
  };

  const failure = (
    operation: PersistedRecordFailure["operation"],
    message: string,
    cause: unknown,
  ): PersistedRecordFailure => ({
    kind: "persisted-record",
    operation,
    message,
    cause: toErrorInfo(cause),
  });

  const write = (next: T): PersistedRecordResult<void> => {
    let serialized: string;
    try {
      serialized = options.serialize(next);
    } catch (cause: unknown) {
      return err(
        failure("serialize", "Persisted value could not be serialized", cause),
      );
    }

    let written: ReturnType<PersistencePort["write"]>;
    try {
      written = persistence.write({ key: options.key, value: serialized });
    } catch (cause: unknown) {
      written = err({
        kind: "persistence",
        operation: "write",
        message: "Persistence write threw an exception",
        cause: toErrorInfo(cause),
      });
    }
    if (written.ok) {
      lastReadFailure = undefined;
      let equivalent = false;
      if (options.equals !== undefined) {
        try {
          equivalent = options.equals(value(), next);
        } catch {
          equivalent = false;
        }
      }
      if (!equivalent) {
        setValue(() => next);
      }
      return ok(undefined);
    }

    const previous = value();
    const restored = read();
    if (lastReadFailure === undefined) {
      setValue(() => restored);
    } else {
      setValue(() => previous);
    }
    return err(written.error);
  };

  const initialValue = read();
  const [value, setValue] = createSignal(initialValue);
  return {
    value,
    readFailure: () => lastReadFailure,
    set(next) {
      return write(next);
    },
    update(updater) {
      let resolved: T;
      try {
        resolved = updater(value());
      } catch (cause: unknown) {
        return err(
          failure(
            "update",
            "Persisted value updater threw an exception",
            cause,
          ),
        );
      }
      return write(resolved);
    },
  };
}
