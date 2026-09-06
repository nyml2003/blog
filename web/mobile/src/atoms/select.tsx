import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  classNames,
  optionValue,
  optionalString,
  requireContent,
  requireFunction,
  requireStringValue,
  type ValidationState,
} from "./config";

type SelectOptions = {
  describedById: string;
  id: string;
  name: string;
  state: "enabled" | "disabled";
  validation: ValidationState;
};
export type SelectProps = {
  content: JSX.Element;
  onChange: JSX.ChangeEventHandler<HTMLSelectElement, Event>;
  options: Partial<SelectOptions>;
  value: string;
};

export function Select(props: SelectProps) {
  assertProps("Select", props);
  assertOptions("Select", props.options);
  requireContent("Select", "content", props.content);
  requireFunction("Select", "onChange", props.onChange);
  const value = requireStringValue("Select", "value", props.value);
  const describedById = optionalString(
    "Select",
    "options.describedById",
    props.options.describedById,
  );
  const id = optionalString("Select", "options.id", props.options.id);
  const name = optionalString("Select", "options.name", props.options.name);
  const state = optionValue(
    "Select",
    "options.state",
    props.options.state,
    ["enabled", "disabled"],
    "enabled",
  );
  const validation = optionValue(
    "Select",
    "options.validation",
    props.options.validation,
    ["valid", "invalid"],
    "valid",
  );

  return (
    <select
      aria-describedby={describedById}
      aria-invalid={validation === "invalid" ? "true" : undefined}
      class={classNames(
        "m-atom-select",
        validation === "invalid" && "is-invalid",
      )}
      disabled={state !== "enabled"}
      id={id}
      name={name}
      onChange={props.onChange}
      value={value}
    >
      {props.content}
    </select>
  );
}
