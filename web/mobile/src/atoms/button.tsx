import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  classNames,
  optionValue,
  optionalFunction,
  optionalString,
  requireContent,
  type ButtonVariant,
  type ControlState,
} from "./config";

type ButtonOptions = {
  id: string;
  name: string;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  state: ControlState;
  type: "button" | "submit" | "reset";
  variant: ButtonVariant;
  width: "content" | "block";
};
export type ButtonProps = {
  content: JSX.Element;
  options: Partial<ButtonOptions>;
};

export function Button(props: ButtonProps) {
  assertProps("Button", props);
  assertOptions("Button", props.options);
  requireContent("Button", "content", props.content);
  optionalFunction("Button", "options.onClick", props.options.onClick);
  const type = optionValue(
    "Button",
    "options.type",
    props.options.type,
    ["button", "submit", "reset"],
    "button",
  );
  const variant = optionValue(
    "Button",
    "options.variant",
    props.options.variant,
    ["primary", "secondary"],
    "primary",
  );
  const width = optionValue(
    "Button",
    "options.width",
    props.options.width,
    ["content", "block"],
    "content",
  );
  const state = optionValue(
    "Button",
    "options.state",
    props.options.state,
    ["enabled", "disabled", "loading"],
    "enabled",
  );
  const isUnavailable = state !== "enabled";
  const id = optionalString("Button", "options.id", props.options.id);
  const name = optionalString("Button", "options.name", props.options.name);
  const className = classNames(
    "m-atom-button",
    `m-atom-button--${variant}`,
    width === "block" && "is-block",
    state === "loading" && "is-loading",
  );

  return (
    <button
      aria-busy={state === "loading" ? "true" : undefined}
      class={className}
      disabled={isUnavailable}
      id={id}
      name={name}
      onClick={props.options.onClick}
      type={type}
    >
      {props.content}
    </button>
  );
}
