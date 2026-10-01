import { type DeepReadonly } from "@fluvient/core";

const nested: DeepReadonly<{ item: { label: string } }> = {
  item: { label: "stable" },
};

// @ts-expect-error DeepReadonly must prevent nested writes.
nested.item.label = "changed";
