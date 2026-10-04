import type { JSX } from "solid-js";
import {
  classNames,
  type AtomContent,
  type ButtonVariant,
  type ControlState,
} from "./config.ts";
import { defineAtom, type AtomDefaults } from "./define.ts";

type IconButtonOptions = {
  id: string;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  state: ControlState;
  variant: ButtonVariant;
};
export type IconButtonProps = {
  ariaLabel: string;
  icon: AtomContent;
  options: Partial<IconButtonOptions>;
};

export const IconButton = defineAtom<IconButtonProps>({
  name: "IconButton",
  defaults: {
    id: undefined,
    onClick: undefined,
    state: "enabled",
    variant: "secondary",
  } as const satisfies AtomDefaults<IconButtonProps>,
  render({ ariaLabel, icon, options }) {
    const isUnavailable = options.state !== "enabled";
    const className = classNames(
      "m-atom-icon-button",
      `m-atom-icon-button--${options.variant}`,
      options.state === "loading" && "is-loading",
    );

    return (
      <button
        aria-busy={options.state === "loading" ? "true" : undefined}
        aria-label={ariaLabel}
        class={className}
        disabled={isUnavailable}
        id={options.id}
        onClick={options.onClick}
        type="button"
      >
        <span aria-hidden="true" class="m-atom-icon-button__icon">
          {icon}
        </span>
      </button>
    );
  },
});
