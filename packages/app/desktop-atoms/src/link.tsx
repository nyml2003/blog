import { splitProps, type Component, type JSX } from "solid-js";

export type LinkVariant = "inline" | "action" | "cta";

export interface LinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly variant?: LinkVariant;
}

export const Link: Component<LinkProps> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "class"]);
  return (
    <a
      {...rest}
      class={`d-atom-link d-atom-link--${local.variant ?? "inline"}${
        local.class ? ` ${local.class}` : ""
      }`}
    />
  );
};
