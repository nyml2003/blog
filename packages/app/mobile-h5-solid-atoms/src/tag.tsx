import { type AtomContent } from "./config.ts";
import { defineAtom, type AtomDefaults } from "./define.ts";

type TagOptions = { id: string };

export type TagProps = {
  content: AtomContent;
  options: Partial<TagOptions>;
};

export const Tag = defineAtom<TagProps>({
  name: "Tag",
  defaults: { id: undefined } as const satisfies AtomDefaults<TagProps>,
  render({ content, options }) {
    return (
      <span class="m-atom-tag" id={options.id}>
        {content}
      </span>
    );
  },
});
