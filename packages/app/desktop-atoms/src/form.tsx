import { splitProps, type Component, type JSX } from "solid-js";

export interface FormProps extends JSX.FormHTMLAttributes<HTMLFormElement> {}

export const Form: Component<FormProps> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <form
      {...rest}
      class={`d-atom-form${local.class ? ` ${local.class}` : ""}`}
    />
  );
};
