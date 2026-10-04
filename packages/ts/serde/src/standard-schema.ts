/**
 * Standard Schema v1 的结构声明（https://standardschema.dev），按规范原文内联。
 *
 * 刻意不引入 @standard-schema/spec 依赖：packages/ts/* 的中立性 guard 只放行
 * @fluvient/* 导入；而标准本身是结构契约，zod、valibot 等实现因结构兼容可直接满足，
 * 换校验库时本包与调用方的公共接口不变。
 */

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: Types<Input, Output> | undefined;
    readonly validate: (
      value: unknown,
      options?: Options | undefined,
    ) => Result<Output> | Promise<Result<Output>>;
  }

  interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  interface Options {
    /** Implicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  type Result<Output> = SuccessResult<Output> | FailureResult;

  interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  interface FailureResult {
    readonly issues: readonly Issue[];
  }

  interface Issue {
    readonly message: string;
    readonly path?: readonly (PropertyKey | PathSegment)[] | undefined;
  }

  interface PathSegment {
    readonly key: PropertyKey;
  }
}

/** schema 的输出类型：校验与投影之后的结构化值。 */
export type StandardOutput<Schema extends StandardSchemaV1> =
  NonNullable<Schema["~standard"]["types"]>["output"];
