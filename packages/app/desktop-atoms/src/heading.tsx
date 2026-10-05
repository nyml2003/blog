import { splitProps, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

export type HeadingLevel = 1 | 2 | 3;

export interface HeadingProps
  extends JSX.HTMLAttributes<HTMLHeadingElement> {
  readonly level?: HeadingLevel;
}

export const Heading: Component<HeadingProps> = (props) => {
  const [local, rest] = splitProps(props, ["level", "class"]);
  const level = () => local.level ?? 2;
  return (
    <Dynamic
      component={`h${level()}`}
      {...rest}
      class={`d-atom-heading d-atom-heading--${level()}${
        local.class ? ` ${local.class}` : ""
      }`}
    />
  );
};
