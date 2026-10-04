import { type AtomContent } from "./config";
import { defineAtom, type AtomDefaults } from "./define";

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
