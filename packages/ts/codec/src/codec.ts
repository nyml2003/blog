import {
  err,
  ok,
  toErrorInfo,
  type ErrorInfo,
  type Result,
  type SerializableFailure,
} from "@fluvient/core";

/**
 * Codec 边界失败。结构上是 SerializableFailure 的成员：
 * kind + message 必在，其余字段为纯数据，cause 只能是 toErrorInfo 的投影。
 */
export interface CodecFailure {
  readonly kind: "codec";
  readonly operation: "encode" | "decode";
  readonly stage: "normalize" | "validate" | "serialize" | "parse";
  readonly message: string;
  readonly code?: string;
  readonly cause?: ErrorInfo;
}

/** validate 钩子的拒绝值：字符串消息，或结构化 SerializableFailure。 */
export type CodecRejection = string | SerializableFailure;

export interface CodecHooks<T> {
  /**
   * 守卫序列化边界上的数据形态。encode 在 normalize 之后、serialize 之前调用；
   * decode 在 parse 之后、normalize 之前调用，收到的是未经投影的原始解析值。
   * 返回 undefined 表示接受；不得抛出（抛出会被转换为 stage "validate" 的失败）。
   */
  validate?(value: unknown): CodecRejection | undefined;

  /**
   * 纯投影：encode 方向把内存形态投影为持久化形态（可裁掉未知字段），
   * decode 方向在 validate 通过后把已验证的值投影回内存形态。不得抛出。
   */
  normalize?(value: T): T;
}

export interface Codec<T> {
  encode(value: T): Result<string, CodecFailure>;
  decode(text: string): Result<T, CodecFailure>;
}

function failure(
  operation: "encode" | "decode",
  stage: CodecFailure["stage"],
  message: string,
  extra: { code?: string; cause?: ErrorInfo } = {},
): CodecFailure {
  const info: CodecFailure = { kind: "codec", operation, stage, message };
  if (extra.code !== undefined) {
    Object.assign(info, { code: extra.code });
  }
  if (extra.cause !== undefined) {
    Object.assign(info, { cause: extra.cause });
  }
  return info;
}

function rejectionFields(rejection: CodecRejection): {
  message: string;
  code?: string;
} {
  if (typeof rejection === "string") {
    return { message: rejection };
  }
  return {
    message: typeof rejection.message === "string" ? rejection.message : rejection.kind,
    ...(typeof rejection.code === "string" ? { code: rejection.code } : {}),
  };
}

/**
 * createJsonCodec：JSON 文本与 T 之间的纯转换。
 * 铁律：只认 string；encode/decode 全路径返回 Result，不抛出；
 * schema 校验由 validate 钩子承担，Codec 本体不依赖 schema 库。
 *
 * 无 validate 钩子时，decode 返回的 T 是对线上数据的信任式收窄，
 * 接入方（如 settings）必须自带 validate 才能获得形态保证。
 */
export function createJsonCodec<T>(hooks: CodecHooks<T> = {}): Codec<T> {
  const encode = (value: T): Result<string, CodecFailure> => {
    let normalized: T = value;
    if (hooks.normalize) {
      try {
        normalized = hooks.normalize(value);
      } catch (thrown) {
        return err(
          failure("encode", "normalize", "normalize hook threw", {
            cause: toErrorInfo(thrown),
          }),
        );
      }
    }
    if (hooks.validate) {
      try {
        const rejection = hooks.validate(normalized);
        if (rejection !== undefined) {
          const fields = rejectionFields(rejection);
          return err(failure("encode", "validate", fields.message, { code: fields.code }));
        }
      } catch (thrown) {
        return err(
          failure("encode", "validate", "validate hook threw", {
            cause: toErrorInfo(thrown),
          }),
        );
      }
    }
    let text: string | undefined;
    try {
      text = JSON.stringify(normalized);
    } catch (thrown) {
      return err(
        failure("encode", "serialize", "JSON.stringify threw", {
          cause: toErrorInfo(thrown),
        }),
      );
    }
    if (text === undefined) {
      return err(
        failure("encode", "serialize", "value is not JSON-serializable"),
      );
    }
    return ok(text);
  };

  const decode = (text: string): Result<T, CodecFailure> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (thrown) {
      return err(
        failure("decode", "parse", "invalid JSON text", { cause: toErrorInfo(thrown) }),
      );
    }
    if (hooks.validate) {
      try {
        const rejection = hooks.validate(parsed);
        if (rejection !== undefined) {
          const fields = rejectionFields(rejection);
          return err(failure("decode", "validate", fields.message, { code: fields.code }));
        }
      } catch (thrown) {
        return err(
          failure("decode", "validate", "validate hook threw", {
            cause: toErrorInfo(thrown),
          }),
        );
      }
    }
    // validate 通过（或调用方以无钩子方式接受信任边界）后，解析值按契约就是 T。
    // 这是 Codec 唯一的显式收窄点，形态保证由 validate 钩子提供。
    if (!hooks.normalize) {
      return ok(parsed as T);
    }
    try {
      return ok(hooks.normalize(parsed as T));
    } catch (thrown) {
      return err(
        failure("decode", "normalize", "normalize hook threw", {
          cause: toErrorInfo(thrown),
        }),
      );
    }
  };

  return { encode, decode };
}
