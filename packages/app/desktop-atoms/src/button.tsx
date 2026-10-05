import { splitProps, type Component, type JSX } from "solid-js";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export interface ButtonProps
  extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export const Button: Component<ButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "type", "class"]);
  return (
    <button
      {...rest}
      type={local.type ?? "button"}
      class={`d-atom-button d-atom-button--${local.variant ?? "secondary"}${
        local.class ? ` ${local.class}` : ""
      }`}
    />
  );
};
