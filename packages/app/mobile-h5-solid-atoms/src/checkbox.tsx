import type { JSX } from "solid-js";
import { classNames, type ValidationState } from "./config.ts";
import { defineAtom, type AtomDefaults } from "./define.ts";

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

export const Checkbox = defineAtom<CheckboxProps>({
  name: "Checkbox",
  defaults: {
    describedById: undefined,
    id: undefined,
    name: undefined,
    state: "enabled",
    validation: "valid",
    value: undefined,
  } as const satisfies AtomDefaults<CheckboxProps>,
  render({ checked, onChange, options }) {
    return (
      <input
        aria-describedby={options.describedById}
        aria-invalid={options.validation === "invalid" ? "true" : undefined}
        checked={checked}
        class={classNames(
          "m-atom-checkbox",
          options.validation === "invalid" && "is-invalid",
        )}
        disabled={options.state !== "enabled"}
        id={options.id}
        name={options.name}
        onChange={onChange}
        type="checkbox"
        value={options.value}
      />
    );
  },
});
