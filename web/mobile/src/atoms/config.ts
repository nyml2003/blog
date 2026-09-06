import type { JSX } from "solid-js";

export type AtomContent = JSX.Element;
export type ButtonVariant = "primary" | "secondary";
export type ControlState = "enabled" | "disabled" | "loading";
export type ValidationState = "valid" | "invalid";

export function atomConfigError(
  component: string,
  field: string,
  expectation: string,
): never {
  throw new Error(`C Mobile atom: ${component}.${field} ${expectation}.`);
}

export function assertOptions(
  component: string,
  options: object | null | undefined,
): void {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    atomConfigError(component, "options", "must be an object");
  }
}

export function assertProps(component: string, props: unknown): void {
  if (props === null || typeof props !== "object" || Array.isArray(props)) {
    atomConfigError(component, "props", "must be an object");
  }
}

export function requireContent(
  component: string,
  field: string,
  content: unknown,
): void {
  const isBlankString = typeof content === "string" && content.trim() === "";
  if (
    content === undefined ||
    content === null ||
    content === false ||
    isBlankString
  ) {
    atomConfigError(component, field, "must contain visible content");
  }
}

export function requireString(
  component: string,
  field: string,
  value: unknown,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    atomConfigError(component, field, "must be a non-empty string");
  }
  return value;
}

export function requireStringValue(
  component: string,
  field: string,
  value: unknown,
): string {
  if (typeof value !== "string") {
    atomConfigError(component, field, "must be a string");
  }
  return value;
}

export function optionalString(
  component: string,
  field: string,
  value: unknown,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireString(component, field, value);
}

export function requireFunction(
  component: string,
  field: string,
  callback: unknown,
): void {
  if (typeof callback !== "function") {
    atomConfigError(component, field, "must be a function");
  }
}

export function optionalFunction(
  component: string,
  field: string,
  callback: unknown,
): void {
  if (callback !== undefined) {
    requireFunction(component, field, callback);
  }
}

function isOption<T extends string>(
  value: string,
  values: readonly T[],
): value is T {
  return values.some((candidate) => candidate === value);
}

export function optionValue<T extends string>(
  component: string,
  field: string,
  value: unknown,
  values: readonly T[],
  fallback: T,
): T {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !isOption(value, values)) {
    atomConfigError(component, field, `must be one of ${values.join(", ")}`);
  }
  return value;
}

export function optionalOptionValue<T extends string>(
  component: string,
  field: string,
  value: unknown,
  values: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  return optionValue(component, field, value, values, values[0]);
}

export function requireBoolean(
  component: string,
  field: string,
  value: unknown,
): boolean {
  if (typeof value !== "boolean") {
    atomConfigError(component, field, "must be a boolean");
  }
  return value;
}

export function classNames(
  ...names: readonly (string | false | undefined)[]
): string {
  return names.filter(Boolean).join(" ");
}
