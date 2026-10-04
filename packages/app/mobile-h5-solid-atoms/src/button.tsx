import type { JSX } from "solid-js";
import {
  classNames,
  type AtomContent,
  type ButtonVariant,
  type ControlState,
} from "./config.ts";
import { defineAtom, type AtomDefaults } from "./define.ts";

type ButtonType = "button" | "submit" | "reset";
type ButtonWidth = "content" | "block";

type ButtonOptions = {
  id: string;
  name: string;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  state: ControlState;
  type: ButtonType;
  variant: ButtonVariant;
  width: ButtonWidth;
};
export type ButtonProps = {
  content: AtomContent;
  options: Partial<ButtonOptions>;
};

export const Button = defineAtom<ButtonProps>({
  name: "Button",
  defaults: {
    id: undefined,
    name: undefined,
    onClick: undefined,
    state: "enabled",
    type: "button",
    variant: "primary",
    width: "content",
  } as const satisfies AtomDefaults<ButtonProps>,
  render({ content, options }) {
    const isUnavailable = options.state !== "enabled";
    const className = classNames(
      "m-atom-button",
      `m-atom-button--${options.variant}`,
      options.width === "block" && "is-block",
      options.state === "loading" && "is-loading",
    );

    return (
      <button
        aria-busy={options.state === "loading" ? "true" : undefined}
        class={className}
        disabled={isUnavailable}
        id={options.id}
        name={options.name}
        onClick={options.onClick}
        type={options.type}
      >
        {content}
      </button>
    );
  },
});
