/** Deep compile-time readonly view for JSON-shaped data. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends { readonly __brand: string }
    ? T
    : T extends string | number | boolean | bigint | symbol | null | undefined
      ? T
      : T extends readonly unknown[]
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T extends object
          ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
          : T;
