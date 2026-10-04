import assert from "node:assert/strict";
import test from "node:test";
import { isSerializableFailure } from "@fluvient/core";
import { serde, decoder, encoder } from "../src/index.ts";
import { failureOf, isRecord, schemaOf, valueOf } from "./fixtures.ts";

// 测试自带解析器/序列化器：本包不再提供媒介实现，也顺带证明机制与实现无关。
const jsonParser = (text: string): unknown => JSON.parse(text);
const jsonSerializer = (value: unknown): string | undefined =>
  JSON.stringify(value);

interface Settings {
  theme: string;
  fontSize: number;
  legacy?: string;
}

const settingsSchema = schemaOf<Settings>((value) => {
  if (!isRecord(value)) {
    return { issues: [{ message: "expected an object" }] };
  }
  const { theme, fontSize } = value;
  if (typeof theme !== "string") {
    return { issues: [{ message: "theme must be a string", path: ["theme"] }] };
  }
  if (typeof fontSize !== "number" || !Number.isFinite(fontSize)) {
    return {
      issues: [
        { message: "fontSize must be a finite number", path: ["fontSize"] },
      ],
    };
  }
  // 显式投影：未知字段在这里被裁掉。
  return { value: { theme, fontSize } };
});

const decodeSettings = (source: string) =>
  decoder.decode({ type: settingsSchema, source, parser: jsonParser });

test("round-trips JSON text through the injected parser and serializer", () => {
  const encoded = valueOf(
    encoder.encode({ value: { theme: "dark" }, serializer: jsonSerializer }),
  );
  assert.equal(encoded, '{"theme":"dark"}');

  const decoded = valueOf(decodeSettings('{"theme":"dark","fontSize":16}'));
  assert.deepEqual(decoded, { theme: "dark", fontSize: 16 });
});

test("decode runs the injected parser, not any package default", () => {
  let calls = 0;
  const counting = (source: string): unknown => {
    calls += 1;
    return JSON.parse(source);
  };

  const viaInjectedJson = valueOf(decodeSettings('{"theme":"dark","fontSize":16}'));
  assert.equal(calls, 0);
  assert.deepEqual(viaInjectedJson, { theme: "dark", fontSize: 16 });

  const viaCounting = valueOf(
    decoder.decode({
      type: settingsSchema,
      source: '{"theme":"paper","fontSize":14}',
      parser: counting,
    }),
  );
  assert.equal(calls, 1);
  assert.deepEqual(viaCounting, { theme: "paper", fontSize: 14 });
});

test("a throwing parser fails at stage parse with the cause attached", () => {
  const failure = failureOf(decodeSettings("{ not json"));

  assert.equal(failure.operation, "decode");
  assert.equal(failure.stage, "parse");
  assert.equal(failure.message, "parser threw");
  assert.equal(failure.cause?.name, "SyntaxError");
});

test("schema rejections map issues with paths and take the first message", () => {
  const issueSchema = schemaOf<never>(() => ({
    issues: [
      { message: "非法数字", path: ["id"] },
      { message: "缺少字段", path: ["meta", { key: "theme" }] },
      { message: "顶层问题" },
    ],
  }));

  const failure = failureOf(
    decoder.decode({ type: issueSchema, source: "{}", parser: jsonParser }),
  );

  assert.equal(failure.operation, "decode");
  assert.equal(failure.stage, "validate");
  assert.deepEqual(failure.issues, [
    "id: 非法数字",
    "meta.theme: 缺少字段",
    "顶层问题",
  ]);
  assert.equal(failure.message, "id: 非法数字");
});

test("a throwing schema fails at stage validate with the cause attached", () => {
  const throwing = schemaOf<unknown>(() => {
    throw new Error("schema exploded", { cause: new RangeError("boom") });
  });

  const failure = failureOf(
    decoder.decode({ type: throwing, source: "1", parser: jsonParser }),
  );
  assert.equal(failure.stage, "validate");
  assert.equal(failure.message, "schema validate threw");
  assert.equal(failure.cause?.name, "Error");
  assert.equal(failure.cause?.cause?.name, "RangeError");
});

test("an asynchronous schema is rejected as a sync violation", () => {
  const asyncSchema = schemaOf<number>(async () => ({ value: 1 }));

  const failure = failureOf(
    decoder.decode({ type: asyncSchema, source: "1", parser: jsonParser }),
  );
  assert.equal(failure.stage, "validate");
  assert.equal(failure.message, "schema validate must be synchronous");
});

test("encode projects with normalize before the injected serializer", () => {
  let normalizes = 0;
  const value: Settings = { theme: "dark", fontSize: 16, legacy: "leftover" };

  const encoded = valueOf(
    encoder.encode({
      value,
      normalize: (settings) => {
        normalizes += 1;
        return { theme: settings.theme, fontSize: settings.fontSize };
      },
      serializer: jsonSerializer,
    }),
  );

  assert.equal(encoded, '{"theme":"dark","fontSize":16}');
  assert.equal(normalizes, 1);
});

test("a throwing normalize converts to a stage normalize failure", () => {
  const failure = failureOf(
    encoder.encode({
      value: 7,
      normalize: () => {
        throw new Error("normalize exploded");
      },
      serializer: jsonSerializer,
    }),
  );

  assert.equal(failure.operation, "encode");
  assert.equal(failure.stage, "normalize");
  assert.equal(failure.message, "normalize hook threw");
  assert.equal(failure.cause?.message, "normalize exploded");
});

test("serializer failures land at stage serialize", () => {
  const throwing = failureOf(
    encoder.encode({
      value: 1,
      serializer: () => {
        throw new Error("serializer exploded");
      },
    }),
  );
  assert.equal(throwing.stage, "serialize");
  assert.equal(throwing.message, "serializer threw");

  const undefinedText = failureOf(
    encoder.encode({ value: undefined, serializer: jsonSerializer }),
  );
  assert.equal(undefinedText.stage, "serialize");
  assert.equal(undefinedText.message, "value is not serializable");
});

test("the serde object exposes both directions", () => {
  const encoded = valueOf(
    serde.encode({
      value: { theme: "dark", fontSize: 16 },
      serializer: jsonSerializer,
    }),
  );
  const decoded = valueOf(
    serde.decode({ type: settingsSchema, source: encoded, parser: jsonParser }),
  );
  assert.deepEqual(decoded, { theme: "dark", fontSize: 16 });
});

test("every serde failure is a serializable failure", () => {
  const failures = [
    failureOf(decodeSettings("{ not json")),
    failureOf(decodeSettings('{"theme":1,"fontSize":"big"}')),
    failureOf(encoder.encode({ value: undefined, serializer: jsonSerializer })),
  ];

  for (const failure of failures) {
    assert.equal(isSerializableFailure(failure), true);
    assert.doesNotThrow(() => JSON.stringify(failure));
  }
});
