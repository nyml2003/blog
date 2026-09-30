import { type DeepReadonly } from "@fluvient-loom/common";

const nested: DeepReadonly<{ item: { label: string } }> = {
  item: { label: "stable" },
};

// @ts-expect-error DeepReadonly must prevent nested writes.
nested.item.label = "changed";
