import { For, useContext } from "solid-js";
import { classNames, type ValidationState } from "./config";
import { defineAtom, type AtomDefaults } from "./define";
import { FieldControlContext } from "./field-context";

type SelectOptions = {
  ariaLabel: string;
  describedById: string;
  id: string;
  name: string;
  state: "enabled" | "disabled";
  validation: ValidationState;
};
export type SelectItem<Value extends string = string> = {
  readonly value: Value;
  readonly label: string;
};

export type SelectProps<Value extends string = string> = {
  items: readonly SelectItem<Value>[];
  onChange: (value: Value) => void;
  options: Partial<SelectOptions>;
  value: Value;
};

export function Select<Value extends string>(props: SelectProps<Value>) {
  const fieldControlId = useContext(FieldControlContext);
  const Control = defineAtom<SelectProps<Value>>({
    name: "Select",
    defaults: {
      ariaLabel: undefined,
      describedById: undefined,
      id: undefined,
      name: undefined,
      state: "enabled",
      validation: "valid",
    } as const satisfies AtomDefaults<SelectProps<Value>>,
    render(model) {
      function changeSelection(
        event: Event & { currentTarget: HTMLSelectElement },
      ) {
        const selected = model.items.find(
          (item) => item.value === event.currentTarget.value,
        );
        if (!selected) return;
        model.onChange(selected.value);
      }

      return (
        <select
          aria-label={fieldControlId ? undefined : model.options.ariaLabel}
          aria-describedby={model.options.describedById}
          aria-invalid={
            model.options.validation === "invalid" ? "true" : undefined
          }
          class={classNames(
            "m-atom-select",
            model.options.validation === "invalid" && "is-invalid",
          )}
          disabled={model.options.state !== "enabled"}
          id={fieldControlId ?? model.options.id}
          name={model.options.name}
          onChange={changeSelection}
          value={model.value}
        >
          <For each={model.items}>
            {(item) => <option value={item.value}>{item.label}</option>}
          </For>
        </select>
      );
    },
  });
  return Control(props);
}
