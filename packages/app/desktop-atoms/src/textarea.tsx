import { splitProps, type Component, type JSX } from "solid-js";

export interface TextareaProps
  extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea: Component<TextareaProps> = (props) => {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <textarea
      {...rest}
      class={`d-atom-textarea${local.class ? ` ${local.class}` : ""}`}
    />
  );
};
