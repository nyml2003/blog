import type { DeepReadonly } from "./readonly";

type WritableArticle = {
  title: string;
  terms: Array<{ name: string }>;
};

const readonlyArticle: DeepReadonly<WritableArticle> = {
  title: "不可变视图",
  terms: [{ name: "TypeScript" }],
};

// @ts-expect-error SDK result values cannot be written through their public type.
readonlyArticle.title = "修改";
// @ts-expect-error Nested SDK result values cannot be written through their public type.
readonlyArticle.terms[0].name = "修改";

void readonlyArticle;
