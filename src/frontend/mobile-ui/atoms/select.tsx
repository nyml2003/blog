import type { JSX } from "solid-js";
import { classNames, type AtomContent, type ValidationState } from "./config";
import { defineAtom, type AtomDefaults } from "./define";

type SelectOptions = {
  describedById: string;
  id: string;
  name: string;
  state: "enabled" | "disabled";
  validation: ValidationState;
};
export type SelectProps = {
  content: AtomContent;
  onChange: JSX.ChangeEventHandler<HTMLSelectElement, Event>;
  options: Partial<SelectOptions>;
  value: string;
};

export const Select = defineAtom<SelectProps>({
  name: "Select",
  defaults: {
    describedById: undefined,
    id: undefined,
    name: undefined,
    state: "enabled",
    validation: "valid",
  } as const satisfies AtomDefaults<SelectProps>,
  render(props) {
    return (
      <select
        aria-describedby={props.options.describedById}
        aria-invalid={props.options.validation === "invalid" ? "true" : undefined}
        class={classNames(
          "m-atom",
          "m-atom-select",
          props.options.validation === "invalid" && "is-invalid",
        )}
        disabled={props.options.state !== "enabled"}
        id={props.options.id}
        name={props.options.name}
        onChange={props.onChange}
        value={props.value}
      >
        {props.content}
      </select>
    );
  },
});
