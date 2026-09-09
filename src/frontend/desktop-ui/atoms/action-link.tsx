import type { JSX } from "solid-js";

type ActionLinkVariant = "primary" | "secondary";
type ActionLinkWidth = "content" | "block";

type ActionLinkOptions = {
  variant: ActionLinkVariant;
  width: ActionLinkWidth;
};

export type ActionLinkProps = {
  content: JSX.Element;
  href: string;
  options: Partial<ActionLinkOptions>;
};

const defaults: ActionLinkOptions = {
  variant: "secondary",
  width: "content",
};

export function ActionLink(props: ActionLinkProps) {
  const options = () => ({ ...defaults, ...props.options });
  const className = () => {
    const names = [
      "d-ui-action-link",
      `d-ui-action-link--${options().variant}`,
    ];
    if (options().width === "block") names.push("is-block");
    return names.join(" ");
  };

  return (
    <a class={className()} href={props.href}>
      {props.content}
    </a>
  );
}
