import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  classNames,
  optionValue,
  optionalFunction,
  optionalString,
  requireContent,
  requireString,
  type ButtonVariant,
  type ControlState,
} from "./config";

type IconButtonOptions = {
  id: string;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  state: ControlState;
  variant: ButtonVariant;
};
export type IconButtonProps = {
  ariaLabel: string;
  icon: JSX.Element;
  options: Partial<IconButtonOptions>;
};

export function IconButton(props: IconButtonProps) {
  assertProps("IconButton", props);
  assertOptions("IconButton", props.options);
  requireString("IconButton", "ariaLabel", props.ariaLabel);
  requireContent("IconButton", "icon", props.icon);
  optionalFunction("IconButton", "options.onClick", props.options.onClick);
  const variant = optionValue(
    "IconButton",
    "options.variant",
    props.options.variant,
    ["primary", "secondary"],
    "secondary",
  );
  const state = optionValue(
    "IconButton",
    "options.state",
    props.options.state,
    ["enabled", "disabled", "loading"],
    "enabled",
  );
  const isUnavailable = state !== "enabled";
  const id = optionalString("IconButton", "options.id", props.options.id);
  const className = classNames(
    "m-atom-icon-button",
    `m-atom-icon-button--${variant}`,
    state === "loading" && "is-loading",
  );

  return (
    <button
      aria-busy={state === "loading" ? "true" : undefined}
      aria-label={props.ariaLabel}
      class={className}
      disabled={isUnavailable}
      id={id}
      onClick={props.options.onClick}
      type="button"
    >
      <span aria-hidden="true" class="m-atom-icon-button__icon">
        {props.icon}
      </span>
    </button>
  );
}
