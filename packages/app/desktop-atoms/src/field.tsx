import { splitProps, type Component, type JSX } from "solid-js";

export interface FieldProps extends JSX.HTMLAttributes<HTMLLabelElement> {
  readonly label: string;
}

export const Field: Component<FieldProps> = (props) => {
  const [local, rest] = splitProps(props, ["label", "class", "children"]);
  return (
    <label
      {...rest}
      class={`d-atom-field${local.class ? ` ${local.class}` : ""}`}
    >
      <span class="d-atom-field__label">{local.label}</span>
      {local.children}
    </label>
  );
};
