import type { JSX } from "solid-js";
import {
  assertOptions,
  assertProps,
  classNames,
  optionValue,
  optionalString,
  requireContent,
} from "./config";

type TextOptions = {
  as: "span" | "p";
  id: string;
  size: "body" | "meta";
  tone: "default" | "muted";
};
export type TextProps = {
  content: JSX.Element;
  options: Partial<TextOptions>;
};

export function Text(props: TextProps) {
  assertProps("Text", props);
  assertOptions("Text", props.options);
  requireContent("Text", "content", props.content);
  const as = optionValue(
    "Text",
    "options.as",
    props.options.as,
    ["span", "p"],
    "span",
  );
  const tone = optionValue(
    "Text",
    "options.tone",
    props.options.tone,
    ["default", "muted"],
    "default",
  );
  const size = optionValue(
    "Text",
    "options.size",
    props.options.size,
    ["body", "meta"],
    "body",
  );
  const className = classNames(
    "m-atom-text",
    `m-atom-text--${tone}`,
    `m-atom-text--${size}`,
  );
  const id = optionalString("Text", "options.id", props.options.id);

  if (as === "p") {
    return (
      <p class={className} id={id}>
        {props.content}
      </p>
    );
  }
  return (
    <span class={className} id={id}>
      {props.content}
    </span>
  );
}
