import { For } from "solid-js";
import { Tab } from "../atoms";
import { nextRovingIndex, type RovingDirection } from "./navigation";

export type TabItem = {
  readonly id: string;
  readonly label: string;
};

type TabGroupOptions = {
  orientation: "horizontal" | "vertical";
};

export type TabGroupProps = {
  ariaLabel: string;
  items: readonly TabItem[];
  onChange: (id: string) => void;
  selectedId: string;
  options: Partial<TabGroupOptions>;
};

export function TabGroup(props: TabGroupProps) {
  let groupElement: HTMLDivElement | undefined;
  const orientation = () => props.options.orientation ?? "horizontal";

  function moveFocus(event: KeyboardEvent) {
    const isHorizontal = orientation() === "horizontal";
    const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";
    const previousKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
    if (![nextKey, previousKey, "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(
      groupElement?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [],
    );
    const currentIndex = tabs.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (currentIndex < 0 || tabs.length === 0) return;
    let direction: RovingDirection = "next";
    if (event.key === previousKey) direction = "previous";
    if (event.key === "Home") direction = "first";
    if (event.key === "End") direction = "last";
    const nextIndex = nextRovingIndex(currentIndex, tabs.length, direction);
    const item = props.items[nextIndex];
    if (!item) return;
    event.preventDefault();
    props.onChange(item.id);
    tabs[nextIndex]?.focus();
  }

  return (
    <div
      ref={(element) => {
        groupElement = element;
      }}
      aria-label={props.ariaLabel}
      class={`m-tab-group m-tab-group--${orientation()}`}
      onKeyDown={moveFocus}
      role="tablist"
    >
      <For each={props.items}>
        {(item) => (
          <Tab
            content={item.label}
            onSelect={() => props.onChange(item.id)}
            selected={props.selectedId === item.id}
            options={{ id: `tab-${item.id}`, orientation: orientation() }}
          />
        )}
      </For>
    </div>
  );
}
