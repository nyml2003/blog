import type { JSX } from "solid-js";

/**
 * options 包的完整渲染模型：`Options` 的每个键都必须出现。
 * 值类型保留调用方可省略字段（`Partial` 里的可选键）的 `undefined`，
 * 其余字段收窄为必有值，render 内不再需要任何 `??` 默认值。
 */
export type CompleteAtomOptions<Options extends object> = {
  [Option in keyof Required<Options>]:
    | Required<Options>[Option]
    | Extract<Options[Option], undefined>;
};

/** `defaults` 的编译期锚定类型：必须逐字覆盖该原子 options 的全部字段。 */
export type AtomDefaults<P extends { options?: object }> = Readonly<
  CompleteAtomOptions<NonNullable<P["options"]>>
>;

/** render 收到的 props：原 Props 去掉 options，加上已合并 defaults 的完整 options。 */
export type AtomRenderProps<P extends { options?: object }> = Omit<
  P,
  "options"
> & {
  options: CompleteAtomOptions<NonNullable<P["options"]>>;
};

export interface AtomDefinition<P extends { options?: object }> {
  name: string;
  /** 用 `as const satisfies AtomDefaults<XxxProps>` 声明；新增 option 字段时缺省会在编译期报错。 */
  defaults: AtomDefaults<P>;
  render: (props: AtomRenderProps<P>) => JSX.Element;
}

/**
 * 类型即契约的原子工厂：TS 类型是唯一防线，这里只负责把 `Partial` options
 * 合并成 render 需要的完整渲染模型，不做任何运行时校验。
 */
export function defineAtom<P extends { options?: object }>(
  definition: AtomDefinition<P>,
): (props: P) => JSX.Element {
  return (props) =>
    definition.render({
      ...props,
      options: { ...definition.defaults, ...props.options },
    });
}
