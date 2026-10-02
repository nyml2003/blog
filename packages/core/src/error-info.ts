import type { Result } from "./result.ts";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface ErrorInfo {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly stack?: string;
  readonly cause?: ErrorInfo;
}

interface MessageFailure {
  readonly kind: string;
  readonly message: string;
  readonly code?: string;
  readonly details?: JsonValue;
  readonly cause?: ErrorInfo;
}

interface CancellationFailureInfo {
  readonly kind: "cancelled";
  readonly message?: never;
  readonly code?: string;
  readonly details?: JsonValue;
  readonly cause?: ErrorInfo;
}

export type SerializableFailure = MessageFailure | CancellationFailureInfo;

export type SerializableResult<
  T,
  E extends SerializableFailure = SerializableFailure,
> = Result<T, E>;

export interface ErrorInfoOptions {
  readonly maxDepth?: number;
  readonly includeStack?: boolean;
}

const DEFAULT_MAX_DEPTH = 3;
const MAX_ALLOWED_DEPTH = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readField(record: Record<string, unknown>, key: string): unknown {
  try {
    return record[key];
  } catch {
    return undefined;
  }
}

function readStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = readField(record, key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeDepth(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    return DEFAULT_MAX_DEPTH;
  }
  return Math.min(value, MAX_ALLOWED_DEPTH);
}

function primitiveMessage(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "Unable to stringify thrown value";
  }
}

export function toErrorInfo(
  thrown: unknown,
  options: ErrorInfoOptions = {},
): ErrorInfo {
  const maxDepth = normalizeDepth(options.maxDepth);
  const includeStack = options.includeStack === true;
  const seen = new WeakSet<object>();

  const visit = (value: unknown, depth: number): ErrorInfo => {
    if (depth > maxDepth) {
      return {
        name: "CauseDepthLimit",
        message: "Error cause chain exceeded the configured depth",
      };
    }

    if (!isRecord(value)) {
      return { name: "ThrownValue", message: primitiveMessage(value) };
    }

    if (seen.has(value)) {
      return { name: "CauseCycle", message: "Error cause chain contains a cycle" };
    }
    seen.add(value);

    const name = readStringField(value, "name") ?? "ThrownValue";
    const message = readStringField(value, "message") ?? primitiveMessage(value);
    const code = readStringField(value, "code");
    const stack = includeStack ? readStringField(value, "stack") : undefined;
    const causeValue = readField(value, "cause");

    const info: ErrorInfo = { name, message };
    if (code !== undefined) {
      Object.assign(info, { code });
    }
    if (stack !== undefined) {
      Object.assign(info, { stack });
    }
    if (causeValue !== undefined) {
      Object.assign(info, { cause: visit(causeValue, depth + 1) });
    }
    return info;
  };

  return visit(thrown, 0);
}

export function isJsonValue(value: unknown): value is JsonValue {
  const seen = new WeakSet<object>();

  const visit = (candidate: unknown): boolean => {
    if (candidate === null) {
      return true;
    }
    if (typeof candidate === "string" || typeof candidate === "boolean") {
      return true;
    }
    if (typeof candidate === "number") {
      return Number.isFinite(candidate);
    }
    if (!isRecord(candidate)) {
      return false;
    }
    if (seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);

    try {
      const isArray = Array.isArray(candidate);
      if (Object.getPrototypeOf(candidate) !== Object.prototype && !isArray) {
        return false;
      }
      if (Object.getOwnPropertySymbols(candidate).length > 0) {
        return false;
      }
      if (isArray) {
        return candidate.every(visit);
      }
      return Object.keys(candidate).every((key) => visit(candidate[key]));
    } catch {
      return false;
    }
  };

  return visit(value);
}

export function isSerializableFailure(value: unknown): value is SerializableFailure {
  if (!isRecord(value) || !isJsonValue(value)) {
    return false;
  }
  const kind = value.kind;
  if (typeof kind !== "string" || kind.length === 0) {
    return false;
  }
  if (kind === "cancelled") {
    return value.message === undefined;
  }
  return typeof value.message === "string";
}
