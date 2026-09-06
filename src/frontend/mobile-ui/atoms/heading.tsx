import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  classNames,
  optionValue,
  optionalString,
  requireContent,
} from "./config";

type HeadingOptions = {
  as: "h1" | "h2" | "h3";
  id: string;
  size: "page" | "section" | "card";
};
export type HeadingProps = {
  content: JSX.Element;
  options: Partial<HeadingOptions>;
};

export function Heading(props: HeadingProps) {
  assertProps("Heading", props);
  assertOptions("Heading", props.options);
  requireContent("Heading", "content", props.content);
  const as = optionValue(
    "Heading",
    "options.as",
    props.options.as,
    ["h1", "h2", "h3"],
    "h2",
  );
  const size = optionValue(
    "Heading",
    "options.size",
    props.options.size,
    ["page", "section", "card"],
    "section",
  );
  const className = classNames("m-atom-heading", `m-atom-heading--${size}`);
  const id = optionalString("Heading", "options.id", props.options.id);

  if (as === "h1") {
    return (
      <h1 class={className} id={id}>
        {props.content}
      </h1>
    );
  }
  if (as === "h3") {
    return (
      <h3 class={className} id={id}>
        {props.content}
      </h3>
    );
  }
  return (
    <h2 class={className} id={id}>
      {props.content}
    </h2>
  );
}
