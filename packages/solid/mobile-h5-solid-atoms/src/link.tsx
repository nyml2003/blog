import type { JSX } from "solid-js";
import { classNames, type AtomContent } from "./config";
import { defineAtom, type AtomDefaults } from "./define";

type LinkAriaCurrent = "page" | "step" | "location" | "date" | "time" | "true";
type LinkTarget = "_self" | "_blank";
type LinkVariant = "inline" | "action" | "cta";

type LinkOptions = {
  ariaCurrent: LinkAriaCurrent;
  id: string;
  onClick: JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent>;
  rel: string;
  target: LinkTarget;
  variant: LinkVariant;
};
export type LinkProps = {
  content: AtomContent;
  href: string;
  options: Partial<LinkOptions>;
};

export const Link = defineAtom<LinkProps>({
  name: "Link",
  defaults: {
    ariaCurrent: undefined,
    id: undefined,
    onClick: undefined,
    rel: undefined,
    target: "_self",
    variant: "inline",
  } as const satisfies AtomDefaults<LinkProps>,
  render(props) {
    return (
      <a
        aria-current={props.options.ariaCurrent}
        class={classNames(
          "m-atom-link",
          `m-atom-link--${props.options.variant}`,
        )}
        href={props.href}
        id={props.options.id}
        onClick={props.options.onClick}
        rel={props.options.rel}
        target={props.options.target}
      >
        {props.content}
      </a>
    );
  },
});
