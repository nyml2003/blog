import type { JSX } from "solid-js";
import { classNames, type ValidationState } from "./config.ts";
import { defineAtom, type AtomDefaults } from "./define.ts";

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

export const Input = defineAtom<InputProps>({
  name: "Input",
  defaults: {
    describedById: undefined,
    id: undefined,
    name: undefined,
    state: "enabled",
    validation: "valid",
  } as const satisfies AtomDefaults<InputProps>,
  render({ onInput, options, value }) {
    return (
      <input
        aria-describedby={options.describedById}
        aria-invalid={options.validation === "invalid" ? "true" : undefined}
        class={classNames(
          "m-atom-input",
          options.validation === "invalid" && "is-invalid",
        )}
        disabled={options.state !== "enabled"}
        id={options.id}
        name={options.name}
        onInput={onInput}
        type="date"
        value={value}
      />
    );
  },
});
