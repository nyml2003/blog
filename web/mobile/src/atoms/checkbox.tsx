import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  classNames,
  optionValue,
  optionalString,
  requireBoolean,
  requireFunction,
  type ValidationState,
} from "./config";

type CheckboxOptions = {
  describedById: string;
  id: string;
  name: string;
  state: "enabled" | "disabled";
  validation: ValidationState;
  value: string;
};
export type CheckboxProps = {
  checked: boolean;
  onChange: JSX.ChangeEventHandler<HTMLInputElement, Event>;
  options: Partial<CheckboxOptions>;
};

export function Checkbox(props: CheckboxProps) {
  assertProps("Checkbox", props);
  assertOptions("Checkbox", props.options);
  const checked = requireBoolean("Checkbox", "checked", props.checked);
  requireFunction("Checkbox", "onChange", props.onChange);
  const describedById = optionalString(
    "Checkbox",
    "options.describedById",
    props.options.describedById,
  );
  const id = optionalString("Checkbox", "options.id", props.options.id);
  const name = optionalString("Checkbox", "options.name", props.options.name);
  const value = optionalString(
    "Checkbox",
    "options.value",
    props.options.value,
  );
  const state = optionValue(
    "Checkbox",
    "options.state",
    props.options.state,
    ["enabled", "disabled"],
    "enabled",
  );
  const validation = optionValue(
    "Checkbox",
    "options.validation",
    props.options.validation,
    ["valid", "invalid"],
    "valid",
  );

  return (
    <input
      aria-describedby={describedById}
      aria-invalid={validation === "invalid" ? "true" : undefined}
      checked={checked}
      class={classNames(
        "m-atom-checkbox",
        validation === "invalid" && "is-invalid",
      )}
      disabled={state !== "enabled"}
      id={id}
      name={name}
      onChange={props.onChange}
      type="checkbox"
      value={value}
    />
  );
}
