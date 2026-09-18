import { For } from "solid-js";
import { Tab } from "../atoms";

export interface TabItem {
  readonly id: string;
  readonly label: string;
}
export interface TabGroupProps {
  readonly ariaLabel: string;
  readonly items: readonly TabItem[];
  readonly onChange: (id: string) => void;
  readonly selectedId: string;
  readonly orientation: "horizontal" | "vertical";
}

export function TabGroup(props: TabGroupProps) {
  return (
    <div
      aria-label={props.ariaLabel}
      class={`m-tab-group m-tab-group--${props.orientation}`}
      role="tablist"
    >
      <For each={props.items}>
        {(item) => (
          <Tab
            content={item.label}
            onSelect={() => props.onChange(item.id)}
            selected={props.selectedId === item.id}
            options={{ orientation: props.orientation }}
          />
        )}
      </For>
    </div>
  );
}
