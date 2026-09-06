import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  classNames,
  optionValue,
  optionalString,
  requireFunction,
  requireStringValue,
  type ValidationState,
} from "./config";

type InputOptions = {
  describedById: string;
  id: string;
  name: string;
  state: "enabled" | "disabled";
  validation: ValidationState;
};
export type InputProps = {
  onInput: JSX.InputEventHandler<HTMLInputElement, InputEvent>;
  options: Partial<InputOptions>;
  value: string;
};

export function Input(props: InputProps) {
  assertProps("Input", props);
  assertOptions("Input", props.options);
  requireFunction("Input", "onInput", props.onInput);
  const value = requireStringValue("Input", "value", props.value);
  const describedById = optionalString(
    "Input",
    "options.describedById",
    props.options.describedById,
  );
  const id = optionalString("Input", "options.id", props.options.id);
  const name = optionalString("Input", "options.name", props.options.name);
  const state = optionValue(
    "Input",
    "options.state",
    props.options.state,
    ["enabled", "disabled"],
    "enabled",
  );
  const validation = optionValue(
    "Input",
    "options.validation",
    props.options.validation,
    ["valid", "invalid"],
    "valid",
  );

  return (
    <input
      aria-describedby={describedById}
      aria-invalid={validation === "invalid" ? "true" : undefined}
      class={classNames(
        "m-atom-input",
        validation === "invalid" && "is-invalid",
      )}
      disabled={state !== "enabled"}
      id={id}
      name={name}
      onInput={props.onInput}
      type="date"
      value={value}
    />
  );
}
