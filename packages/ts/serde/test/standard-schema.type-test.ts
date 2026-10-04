/**
 * 编译期锚：zod 公布的 Standard Schema 公共声明必须与内联声明结构兼容，
 * 且公共 API 能从 request.type 推断输出类型。只编译不执行
 * （文件名不匹配包内 tsx --test 的 test/*.test.ts 通配，由根 tsconfig 编译）。
 *
 * 夹具照抄 zod v4 的公共声明（zod/src/v4/core/standard-schema.ts），
 * 无需把 zod 变成依赖也能在编译期发现结构不兼容。
 */
import type { Result } from "@fluvient/core";
import {
  decoder,
  encoder,
  type SerdeFailure,
  type StandardOutput,
  type StandardSchemaV1,
} from "../src/index.ts";

// 媒介实现由调用方注入（本包不再提供）；这里只声明形状用于推断断言。
declare const jsonParser: (text: string) => unknown;
declare const jsonSerializer: (value: unknown) => string | undefined;

interface ZodLikeStandardTypedV1<Input = unknown, Output = Input> {
  readonly "~standard": ZodLikeStandardTypedV1.Props<Input, Output>;
}

declare namespace ZodLikeStandardTypedV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: Types<Input, Output> | undefined;
  }

  interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
}

interface ZodLikeStandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": ZodLikeStandardSchemaV1.Props<Input, Output>;
}

declare namespace ZodLikeStandardSchemaV1 {
  interface Props<Input = unknown, Output = Input>
    extends ZodLikeStandardTypedV1.Props<Input, Output> {
    readonly validate: (
      value: unknown,
      options?: Options | undefined,
    ) => Result<Output> | Promise<Result<Output>>;
  }

  interface Options {
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  type Result<Output> = SuccessResult<Output> | FailureResult;

  interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  interface PathSegment {
    readonly key: PropertyKey;
  }
}

declare const zodSchema: ZodLikeStandardSchemaV1<unknown, { id: number }>;

/** ① 结构兼容：zod 声明可直接赋给内联的 Standard Schema 声明。 */
const compatible: StandardSchemaV1<unknown, { id: number }> = zodSchema;

/** ② 公共 API 从 request.type 推断输出类型（调用点不写泛型）。 */
const parsed: Result<{ id: number }, SerdeFailure> = decoder.decode({
  type: zodSchema,
  source: '{"id":7}',
  parser: jsonParser,
});

const encoded: Result<string, SerdeFailure> = encoder.encode({
  value: { id: 1 },
  serializer: jsonSerializer,
});

/** ③ 声明的命名空间类型可经包入口使用（Issue 的路径段形态）。 */
const issue: StandardSchemaV1.Issue = { message: "x", path: ["a", { key: "b" }] };

/** ④ StandardOutput 在 schema 泛型位置解析出精确输出类型，不退化为 unknown。 */
const zodOutput: StandardOutput<typeof zodSchema> = { id: 1 };
const backToPlain: { id: number } = zodOutput;

/** ⑤ 反例：没有 ~standard 结构的对象必须被拒绝。 */
declare const notASchema: { validate(value: unknown): { value: unknown } };
// @ts-expect-error 缺少 ~standard 结构，不是 Standard Schema
const rejected: StandardSchemaV1 = notASchema;

// 以上声明仅作编译期断言；本文件不会被执行。
