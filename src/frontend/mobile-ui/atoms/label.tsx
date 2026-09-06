import type { AtomContent } from "./config";
import { defineAtom, type AtomDefaults } from "./define";

type LabelOptions = {
  id: string;
};
export type LabelProps = {
  content: AtomContent;
  controlId: string;
  options: Partial<LabelOptions>;
};

export const Label = defineAtom<LabelProps>({
  name: "Label",
  defaults: {
    id: undefined,
  } as const satisfies AtomDefaults<LabelProps>,
  render({ content, controlId, options }) {
    return (
      <label class="m-atom-label" for={controlId} id={options.id}>
        {content}
      </label>
    );
  },
});
