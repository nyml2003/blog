import { splitProps, type Component, type JSX } from "solid-js";

export interface SelectProps
  extends JSX.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select: Component<SelectProps> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <select
      {...rest}
      class={`d-atom-select${local.class ? ` ${local.class}` : ""}`}
    />
  );
};
