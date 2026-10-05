import { splitProps, type Component, type JSX } from "solid-js";

export interface InputProps
  extends JSX.InputHTMLAttributes<HTMLInputElement> {}

export const Input: Component<InputProps> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <input
      {...rest}
      class={`d-atom-input${local.class ? ` ${local.class}` : ""}`}
    />
  );
};
