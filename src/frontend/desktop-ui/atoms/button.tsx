import type { JSX } from "solid-js";

type ButtonState = "enabled" | "disabled" | "loading";
type ButtonType = "button" | "submit" | "reset";
type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonWidth = "content" | "block";

type ButtonOptions = {
  ariaLabel: string | undefined;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent> | undefined;
  state: ButtonState;
  type: ButtonType;
  variant: ButtonVariant;
  width: ButtonWidth;
};

export type ButtonProps = {
  content: JSX.Element;
  options: Partial<ButtonOptions>;
};

const defaults: ButtonOptions = {
  ariaLabel: undefined,
  onClick: undefined,
  state: "enabled",
  type: "button",
  variant: "secondary",
  width: "content",
};

export function Button(props: ButtonProps) {
  const options = () => ({ ...defaults, ...props.options });
  const className = () => {
    const names = ["d-ui-button", `d-ui-button--${options().variant}`];
    if (options().width === "block") names.push("is-block");
    if (options().state === "loading") names.push("is-loading");
    return names.join(" ");
  };

  return (
    <button
      aria-busy={options().state === "loading" ? "true" : undefined}
      aria-label={options().ariaLabel}
      class={className()}
      disabled={options().state !== "enabled"}
      onClick={options().onClick}
      type={options().type}
    >
      {props.content}
    </button>
  );
}
