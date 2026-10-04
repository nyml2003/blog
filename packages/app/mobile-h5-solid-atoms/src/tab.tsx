import type { JSX } from "solid-js";
import { classNames, type AtomContent } from "./config.ts";
import { defineAtom, type AtomDefaults } from "./define.ts";

type TabOptions = {
  ariaControls: string;
  id: string;
  orientation: "horizontal" | "vertical";
};

export type TabProps = {
  content: AtomContent;
  onSelect: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  selected: boolean;
  options: Partial<TabOptions>;
  /** 元素回调：组合原语（TabGroup）借此建立 id → 元素直连，不做 DOM 反查。 */
  ref?: (element: HTMLButtonElement) => void;
};

export const Tab = defineAtom<TabProps>({
  name: "Tab",
  defaults: {
    ariaControls: undefined,
    id: undefined,
    orientation: "horizontal",
  } as const satisfies AtomDefaults<TabProps>,
  render(props) {
    return (
      <button
        aria-controls={props.options.ariaControls}
        ref={props.ref}
        aria-selected={props.selected ? "true" : "false"}
        class={classNames(
          "m-atom-tab",
          `m-atom-tab--${props.options.orientation}`,
          props.selected && "is-selected",
        )}
        id={props.options.id}
        onClick={props.onSelect}
        role="tab"
        tabIndex={props.selected ? 0 : -1}
        type="button"
      >
        {props.content}
      </button>
    );
  },
});
