import {
  err,
  ok,
  toErrorInfo,
  type ErrorInfo,
  type Result,
} from "@fluvient/core";
import type { StandardSchemaV1 } from "./standard-schema.ts";

/**
 * Serde 边界失败。结构上是 SerializableFailure 的成员：
 * kind + message 必在，其余字段为纯数据，cause 只能是 toErrorInfo 的投影。
 */
export interface SerdeFailure {
  readonly kind: "serde";
  readonly operation: "encode" | "decode";
  readonly stage: "normalize" | "validate" | "serialize" | "parse";
  readonly message: string;
  /** schema 拒绝时的逐条问题（如 "id: 必须是正整数"）；只在 validate 阶段出现。 */
  readonly issues?: readonly string[];
  readonly cause?: ErrorInfo;
}

/** 注入的解析函数：原料 → unknown。抛出归一为 stage "parse" 的失败。 */
export type Parser<Source> = (source: Source) => unknown;

/** 注入的序列化函数：值 → 文本；返回 undefined 表示不可序列化。 */
export type Serializer = (value: unknown) => string | undefined;

export interface DecodeRequest<Source, Input, Output> {
  /** 校验与投影的 schema（Standard Schema，必须同步）。 */
  readonly type: StandardSchemaV1<Input, Output>;
  readonly source: Source;
  /** 解析函数，必填：本包不提供媒介默认。 */
  readonly parser: Parser<Source>;
}

export interface Decoder {
  decode<Source, Input, Output>(
    request: DecodeRequest<Source, Input, Output>,
  ): Result<Output, SerdeFailure>;
}

export interface EncodeRequest<Value> {
  readonly value: Value;
  /** 序列化函数，必填：本包不提供媒介默认。 */
  readonly serializer: Serializer;
  /**
   * 纯投影，写入前把内存形态投影为持久化形态（可裁掉未知字段）。
   * schema 不参与 encode；写入形态由 normalize 与调用方负责。不得抛出。
   */
  readonly normalize?: (value: Value) => Value;
}

export interface Encoder {
  encode<Value>(request: EncodeRequest<Value>): Result<string, SerdeFailure>;
}

export interface Serde extends Encoder, Decoder {}

function failure(
  operation: "encode" | "decode",
  stage: SerdeFailure["stage"],
  message: string,
  extra: { issues?: readonly string[]; cause?: ErrorInfo } = {},
): SerdeFailure {
  const info: SerdeFailure = { kind: "serde", operation, stage, message };
  if (extra.issues !== undefined) {
    Object.assign(info, { issues: extra.issues });
  }
  if (extra.cause !== undefined) {
    Object.assign(info, { cause: extra.cause });
  }
  return info;
}

function pathText(path: StandardSchemaV1.Issue["path"]): string {
  if (path === undefined) return "";
  return path
    .map((segment) => String(typeof segment === "object" ? segment.key : segment))
    .join(".");
}

function issueText(issue: StandardSchemaV1.Issue): string {
  const at = pathText(issue.path);
  return at === "" ? issue.message : `${at}: ${issue.message}`;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

/**
 * Standard Schema 的统一执行点，decode 的校验阶段。
 *
 * sync-only：decode 全路径同步返回 Result，schema 返回 thenable 视为接入错误。
 * schema 抛出、拒绝、异步一律归一为 stage "validate" 的失败。
 */
function runSchema<Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
  value: unknown,
  operation: "decode",
): Result<Output, SerdeFailure> {
  let outcome: StandardSchemaV1.Result<Output> | Promise<StandardSchemaV1.Result<Output>>;
  try {
    outcome = schema["~standard"].validate(value);
  } catch (thrown) {
    return err(
      failure(operation, "validate", "schema validate threw", {
        cause: toErrorInfo(thrown),
      }),
    );
  }
  if (isThenable(outcome)) {
    return err(
      failure(operation, "validate", "schema validate must be synchronous"),
    );
  }
  if (outcome.issues === undefined) {
    return ok(outcome.value);
  }
  const issues = outcome.issues.map(issueText);
  return err(
    failure(operation, "validate", issues[0] ?? "value does not match the schema", {
      issues,
    }),
  );
}

function decode<Source, Input, Output>(
  request: DecodeRequest<Source, Input, Output>,
): Result<Output, SerdeFailure> {
  let raw: unknown;
  try {
    raw = request.parser(request.source);
  } catch (thrown) {
    return err(
      failure("decode", "parse", "parser threw", { cause: toErrorInfo(thrown) }),
    );
  }
  return runSchema(request.type, raw, "decode");
}

function encode<Value>(
  request: EncodeRequest<Value>,
): Result<string, SerdeFailure> {
  let normalized: Value = request.value;
  if (request.normalize) {
    try {
      normalized = request.normalize(request.value);
    } catch (thrown) {
      return err(
        failure("encode", "normalize", "normalize hook threw", {
          cause: toErrorInfo(thrown),
        }),
      );
    }
  }
  let text: string | undefined;
  try {
    text = request.serializer(normalized);
  } catch (thrown) {
    return err(
      failure("encode", "serialize", "serializer threw", {
        cause: toErrorInfo(thrown),
      }),
    );
  }
  if (text === undefined) {
    return err(failure("encode", "serialize", "value is not serializable"));
  }
  return ok(text);
}

/**
 * 媒介无关的三个对象：请求自携 schema（type）、原料（source）与解析/序列化函数，
 * 本包不提供任何媒介默认；绑定默认由各端 SDK 在自己那层做。
 */
export const decoder: Decoder = { decode };
export const encoder: Encoder = { encode };
export const serde: Serde = { decode, encode };
