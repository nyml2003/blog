import { For } from "solid-js";
import { Chip } from "../atoms";
import { nextRovingIndex } from "./navigation";

export type ChipItem = {
  readonly id: string;
  readonly label: string;
};

type ChipGroupOptions = Record<never, never>;

export type ChipGroupProps = {
  ariaLabel: string;
  items: readonly ChipItem[];
  onChange: (id: string) => void;
  selectedId: string;
  options: Partial<ChipGroupOptions>;
};

export function ChipGroup(props: ChipGroupProps) {
  let groupElement: HTMLDivElement | undefined;

  function moveFocus(event: KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const chips = Array.from(
      groupElement?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? [],
    );
    const currentIndex = chips.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (currentIndex < 0 || chips.length === 0) return;
    const direction = event.key === "ArrowRight" ? "next" : "previous";
    const nextIndex = nextRovingIndex(currentIndex, chips.length, direction);
    const item = props.items[nextIndex];
    if (!item) return;
    event.preventDefault();
    props.onChange(item.id);
    chips[nextIndex]?.focus();
  }

  return (
    <div
      ref={(element) => {
        groupElement = element;
      }}
      aria-label={props.ariaLabel}
      class="m-chip-group"
      onKeyDown={moveFocus}
      role="radiogroup"
    >
      <For each={props.items}>
        {(item) => (
          <Chip
            content={item.label}
            onSelect={() => props.onChange(item.id)}
            selected={props.selectedId === item.id}
            options={{ id: `chip-${item.id}` }}
          />
        )}
      </For>
    </div>
  );
}
