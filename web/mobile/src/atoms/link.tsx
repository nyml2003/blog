import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  classNames,
  optionValue,
  optionalFunction,
  optionalOptionValue,
  optionalString,
  requireContent,
  requireString,
} from "./config";

type LinkOptions = {
  ariaCurrent: "page" | "step" | "location" | "date" | "time" | "true";
  id: string;
  onClick: JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent>;
  rel: string;
  target: "_self" | "_blank";
  variant: "inline" | "action";
};
export type LinkProps = {
  content: JSX.Element;
  href: string;
  options: Partial<LinkOptions>;
};

function hasSafeNewWindowRel(rel: string | undefined): boolean {
  if (rel === undefined) {
    return false;
  }
  const tokens = rel.split(/\s+/);
  return tokens.includes("noopener") && tokens.includes("noreferrer");
}

export function Link(props: LinkProps) {
  assertProps("Link", props);
  assertOptions("Link", props.options);
  requireContent("Link", "content", props.content);
  requireString("Link", "href", props.href);
  optionalFunction("Link", "options.onClick", props.options.onClick);
  const variant = optionValue(
    "Link",
    "options.variant",
    props.options.variant,
    ["inline", "action"],
    "inline",
  );
  const target = optionValue(
    "Link",
    "options.target",
    props.options.target,
    ["_self", "_blank"],
    "_self",
  );
  const ariaCurrent = optionalOptionValue(
    "Link",
    "options.ariaCurrent",
    props.options.ariaCurrent,
    ["page", "step", "location", "date", "time", "true"],
  );
  const id = optionalString("Link", "options.id", props.options.id);
  const rel = optionalString("Link", "options.rel", props.options.rel);
  if (target === "_blank" && !hasSafeNewWindowRel(rel)) {
    throw new Error(
      "C Mobile atom: Link.options.rel must include noopener and noreferrer for target _blank.",
    );
  }

  return (
    <a
      aria-current={ariaCurrent}
      class={classNames("m-atom-link", `m-atom-link--${variant}`)}
      href={props.href}
      id={id}
      onClick={props.options.onClick}
      rel={rel}
      target={target}
    >
      {props.content}
    </a>
  );
}
