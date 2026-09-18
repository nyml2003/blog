import type { DeepReadonly } from "../../../app/kernel/index.ts";

const nested: DeepReadonly<{ item: { label: string } }> = {
  item: { label: "stable" },
};

// @ts-expect-error DeepReadonly must prevent nested writes.
nested.item.label = "changed";
