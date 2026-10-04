export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isResult(value: unknown): value is Result<unknown, unknown> {
  return typeof value === "object" && value !== null && "ok" in value && typeof value.ok === "boolean";
}
