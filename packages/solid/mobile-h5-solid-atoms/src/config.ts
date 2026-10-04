import type { JSX } from "solid-js";

/**
 * 原子间共享的显示状态类型与 class 拼接 helper。
 * 自 2026-09-06 起类型即契约：这里不再承载任何运行时校验，
 * 校验由 `XxxOptions`/`XxxProps` 的字面量联合与必填字段在编译期完成。
 */
export type AtomContent = JSX.Element;
export type ButtonVariant = "primary" | "secondary";
export type ControlState = "enabled" | "disabled" | "loading";
export type ValidationState = "valid" | "invalid";

export function classNames(
  ...names: readonly (string | false | undefined)[]
): string {
  return names.filter(Boolean).join(" ");
}
