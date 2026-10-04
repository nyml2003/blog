import type { JSX } from "solid-js";
import { classNames, type AtomContent } from "./config";
import { defineAtom, type AtomDefaults } from "./define";

type ChipOptions = { id: string };

export type ChipProps = {
  content: AtomContent;
  onSelect: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  selected: boolean;
  options: Partial<ChipOptions>;
};

export const Chip = defineAtom<ChipProps>({
  name: "Chip",
  defaults: { id: undefined } as const satisfies AtomDefaults<ChipProps>,
  render(props) {
    return (
      <button
        aria-checked={props.selected ? "true" : "false"}
        class={classNames("m-atom-chip", props.selected && "is-selected")}
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
