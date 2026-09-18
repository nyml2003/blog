export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? ReadonlyArray<DeepReadonly<Item>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

// The conversion is compile-time only; the value is intentionally not frozen or cloned.
export function readonlyView<T>(value: T): DeepReadonly<T> {
  return value as DeepReadonly<T>;
}
