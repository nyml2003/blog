import { classNames, type AtomContent } from "./config";
import { defineAtom, type AtomDefaults } from "./define";

type HeadingAs = "h1" | "h2" | "h3";
type HeadingSize = "page" | "section" | "card";

type HeadingOptions = {
  as: HeadingAs;
  id: string;
  size: HeadingSize;
};
export type HeadingProps = {
  content: AtomContent;
  options: Partial<HeadingOptions>;
};

export const Heading = defineAtom<HeadingProps>({
  name: "Heading",
  defaults: {
    as: "h2",
    id: undefined,
    size: "section",
  } as const satisfies AtomDefaults<HeadingProps>,
  render({ content, options }) {
    const className = classNames(
      "m-atom-heading",
      `m-atom-heading--${options.size}`,
    );

    if (options.as === "h1") {
      return (
        <h1 class={className} id={options.id}>
          {content}
        </h1>
      );
    }
    if (options.as === "h3") {
      return (
        <h3 class={className} id={options.id}>
          {content}
        </h3>
      );
    }
    return (
      <h2 class={className} id={options.id}>
        {content}
      </h2>
    );
  },
});
