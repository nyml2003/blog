import type { JSX } from "solid-js";
import { classNames, type AtomContent } from "./config";
import { defineAtom, type AtomDefaults } from "./define";

type LinkAriaCurrent = "page" | "step" | "location" | "date" | "time" | "true";
type LinkTarget = "_self" | "_blank";
type LinkVariant = "inline" | "action";

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
  render({ content, href, options }) {
    return (
      <a
        aria-current={options.ariaCurrent}
        class={classNames("m-atom-link", `m-atom-link--${options.variant}`)}
        href={href}
        id={options.id}
        onClick={options.onClick}
        rel={options.rel}
        target={options.target}
      >
        {content}
      </a>
    );
  },
});
