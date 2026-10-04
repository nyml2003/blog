import type { JSX } from "solid-js";
import { classNames, type AtomContent } from "./config.ts";
import { defineAtom, type AtomDefaults } from "./define.ts";

type ChipOptions = { id: string };

export type ChipProps = {
  content: AtomContent;
  onSelect: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  selected: boolean;
  options: Partial<ChipOptions>;
  /** 元素回调：组合原语（ChipGroup）借此建立 id → 元素直连，不做 DOM 反查。 */
  ref?: (element: HTMLButtonElement) => void;
};

export const Chip = defineAtom<ChipProps>({
  name: "Chip",
  defaults: { id: undefined } as const satisfies AtomDefaults<ChipProps>,
  render(props) {
    return (
      <button
        aria-checked={props.selected ? "true" : "false"}
        class={classNames("m-atom-chip", props.selected && "is-selected")}
        ref={props.ref}
        id={props.options.id}
        onClick={props.onSelect}
        role="radio"
        type="button"
      >
        {props.content}
      </button>
    );
  },
});
