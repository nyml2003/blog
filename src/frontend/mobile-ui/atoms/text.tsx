import { classNames, type AtomContent } from "./config";
import { defineAtom, type AtomDefaults } from "./define";

type TextAs = "span" | "p";
type TextSize = "body" | "meta";
type TextTone = "default" | "muted" | "accent";

type TextOptions = {
  as: TextAs;
  id: string;
  size: TextSize;
  tone: TextTone;
};
export type TextProps = {
  content: AtomContent;
  options: Partial<TextOptions>;
};

export const Text = defineAtom<TextProps>({
  name: "Text",
  defaults: {
    as: "span",
    id: undefined,
    size: "body",
    tone: "default",
  } as const satisfies AtomDefaults<TextProps>,
  render({ content, options }) {
    const className = classNames(
      "m-atom-text",
      `m-atom-text--${options.tone}`,
      `m-atom-text--${options.size}`,
    );

    if (options.as === "p") {
      return (
        <p class={className} id={options.id}>
          {content}
        </p>
      );
    }
    return (
      <span class={className} id={options.id}>
        {content}
      </span>
    );
  },
});
