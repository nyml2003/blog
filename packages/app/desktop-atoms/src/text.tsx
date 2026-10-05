import { splitProps, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

export type TextTone = "default" | "muted" | "accent" | "danger";
export type TextSize = "body" | "meta";
export type TextAs = "p" | "span" | "strong" | "small";

export interface TextProps extends JSX.HTMLAttributes<HTMLElement> {
  readonly as?: TextAs;
  readonly tone?: TextTone;
  readonly size?: TextSize;
}

export const Text: Component<TextProps> = (props) => {
  const [local, rest] = splitProps(props, ["as", "tone", "size", "class"]);
  return (
    <Dynamic
      component={local.as ?? "p"}
      {...rest}
      class={`d-atom-text d-atom-text--${local.tone ?? "default"} d-atom-text--${
        local.size ?? "body"
      }${local.class ? ` ${local.class}` : ""}`}
    />
  );
};
