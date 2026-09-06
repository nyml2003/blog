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
  render({ content, onChange, options, value }) {
    return (
      <select
        aria-describedby={options.describedById}
        aria-invalid={options.validation === "invalid" ? "true" : undefined}
        class={classNames(
          "m-atom-select",
          options.validation === "invalid" && "is-invalid",
        )}
        disabled={options.state !== "enabled"}
        id={options.id}
        name={options.name}
        onChange={onChange}
        value={value}
      >
        {content}
      </select>
    );
  },
});
