import assert from "node:assert/strict";
import { test } from "node:test";

import { isSerializableFailure } from "@fluvient/core";

import { createJsonCodec, type CodecFailure } from "../src/codec.ts";

interface Settings {
  readonly theme: "paper" | "dark" | "sepia";
  readonly fontSize: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const settingsCodec = createJsonCodec<Settings>({
  validate: (value) => {
    if (!isRecord(value)) {
      return "settings must be an object";
    }
    if (value.theme !== "paper" && value.theme !== "dark" && value.theme !== "sepia") {
      return "unknown theme";
    }
    if (typeof value.fontSize !== "number" || !Number.isFinite(value.fontSize)) {
      return "fontSize must be a finite number";
    }
    return undefined;
  },
  normalize: (value) => ({
    theme: value.theme,
    fontSize: value.fontSize,
  }),
});

test("round-trips domain values through JSON text without hooks", () => {
  const codec = createJsonCodec<Settings>();

  const encoded = codec.encode({ theme: "sepia", fontSize: 18 });
  assert.equal(encoded.ok, true);
  assert.equal((encoded as { value: string }).value, '{"theme":"sepia","fontSize":18}');

  const decoded = codec.decode('{"theme":"sepia","fontSize":18}');
  assert.deepEqual(decoded, { ok: true, value: { theme: "sepia", fontSize: 18 } });
});

test("decode rejects invalid JSON text with the parse cause preserved", () => {
  const decoded = settingsCodec.decode("{ not json");

  assert.equal(decoded.ok, false);
  const failure = (decoded as { error: CodecFailure }).error;
  assert.equal(failure.kind, "codec");
  assert.equal(failure.operation, "decode");
  assert.equal(failure.stage, "parse");
  assert.equal(failure.cause?.name, "SyntaxError");
});

test("encode reports cyclic and non-serializable values instead of throwing", () => {
  const hookless = createJsonCodec<Settings>();
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;

  const cyclicResult = hookless.encode(cyclic as unknown as Settings);
  assert.equal(cyclicResult.ok, false);
  const cyclicFailure = (cyclicResult as { error: CodecFailure }).error;
  assert.equal(cyclicFailure.stage, "serialize");
  assert.equal(cyclicFailure.cause?.name, "TypeError");

  const undefinedResult = createJsonCodec<Settings | undefined>().encode(undefined);
  assert.equal(undefinedResult.ok, false);
  const undefinedFailure = (undefinedResult as { error: CodecFailure }).error;
  assert.equal(undefinedFailure.stage, "serialize");
  assert.equal(undefinedFailure.message, "value is not JSON-serializable");
});

test("validate rejections surface on both operations with message and code", () => {
  const rejected = settingsCodec.encode({ theme: "neon" as Settings["theme"], fontSize: 18 });
  assert.equal(rejected.ok, false);
  const encodeFailure = (rejected as { error: CodecFailure }).error;
  assert.equal(encodeFailure.operation, "encode");
  assert.equal(encodeFailure.stage, "validate");
  assert.equal(encodeFailure.message, "unknown theme");

  const structured = settingsCodec.decode('{"theme":"paper","fontSize":"big"}');
  assert.equal(structured.ok, false);
  const decodeFailure = (structured as { error: CodecFailure }).error;
  assert.equal(decodeFailure.operation, "decode");
  assert.equal(decodeFailure.stage, "validate");
  assert.equal(decodeFailure.message, "fontSize must be a finite number");
});

test("structured rejections keep their code on the codec failure", () => {
  const codec = createJsonCodec<Settings>({
    validate: () => ({ kind: "settings", message: "legacy shape", code: "E_LEGACY" }),
  });

  const decoded = codec.decode('{"theme":"paper"}');

  assert.equal(decoded.ok, false);
  const failure = (decoded as { error: CodecFailure }).error;
  assert.equal(failure.message, "legacy shape");
  assert.equal(failure.code, "E_LEGACY");
});

test("normalize strips unknown fields so old data is never written back verbatim", () => {
  const decoded = settingsCodec.decode('{"theme":"dark","fontSize":16,"legacy":"leftover"}');
  assert.deepEqual(decoded, { ok: true, value: { theme: "dark", fontSize: 16 } });

  const encoded = settingsCodec.encode({ theme: "dark", fontSize: 16 });
  assert.equal(encoded.ok, true);
  assert.equal((encoded as { value: string }).value, '{"theme":"dark","fontSize":16}');
});

test("hooks run in the fixed order: encode normalizes before validate, decode validates raw input", () => {
  const seenByValidate: unknown[] = [];
  const codec = createJsonCodec<Settings>({
    validate: (value) => {
      seenByValidate.push(value);
      return undefined;
    },
    normalize: (value) => ({ theme: value.theme, fontSize: value.fontSize }),
  });

  const raw: { theme: "paper"; fontSize: 18; extra: string } = {
    theme: "paper",
    fontSize: 18,
    extra: "strip me",
  };
  const encoded = codec.encode(raw as unknown as Settings);
  assert.equal(encoded.ok, true);
  // encode：validate 看到的是 normalize 投影后的持久化形态。
  assert.deepEqual(seenByValidate[0], { theme: "paper", fontSize: 18 });

  codec.decode('{"theme":"paper","fontSize":18,"extra":"strip me"}');
  // decode：validate 看到的是 parse 后的原始线上形态，未经过 normalize。
  assert.deepEqual(seenByValidate[1], {
    theme: "paper",
    fontSize: 18,
    extra: "strip me",
  });
});

test("throwing hooks convert to failures with the thrown cause attached", () => {
  const throwingValidate = createJsonCodec<Settings>({
    validate: () => {
      throw new Error("validate exploded", { cause: new RangeError("boom") });
    },
  });

  const encodeFailure = (throwingValidate.encode({ theme: "paper", fontSize: 18 }) as {
    error: CodecFailure;
  }).error;
  assert.equal(encodeFailure.stage, "validate");
  assert.equal(encodeFailure.message, "validate hook threw");
  assert.equal(encodeFailure.cause?.name, "Error");
  assert.equal(encodeFailure.cause?.cause?.name, "RangeError");

  const normalizeOnly = createJsonCodec<Settings>({
    normalize: () => {
      throw new Error("normalize exploded");
    },
  });
  const decodeFailure = (normalizeOnly.decode('{"theme":"paper","fontSize":18}') as {
    error: CodecFailure;
  }).error;
  assert.equal(decodeFailure.operation, "decode");
  assert.equal(decodeFailure.stage, "normalize");
  assert.equal(decodeFailure.cause?.message, "normalize exploded");

  const encodeNormalizeFailure = (normalizeOnly.encode({ theme: "paper", fontSize: 18 }) as {
    error: CodecFailure;
  }).error;
  assert.equal(encodeNormalizeFailure.operation, "encode");
  assert.equal(encodeNormalizeFailure.stage, "normalize");
});

test("every codec failure is a serializable failure", () => {
  const decoded = settingsCodec.decode("{ not json");
  const failure = (decoded as { error: CodecFailure }).error;

  assert.equal(isSerializableFailure(failure), true);
  assert.doesNotThrow(() => JSON.stringify(failure));
});
