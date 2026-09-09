#!/usr/bin/env node

let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;

if (
  prompt.includes(
    "Task: review the normalized applied taxonomy diff exactly once",
  )
) {
  process.stdout.write('{"decision":"approve"}\n');
  process.exit(0);
}

const marker = "Input JSON:\n";
const payloadOffset = prompt.lastIndexOf(marker);
if (payloadOffset < 0) process.exit(2);

const payload = JSON.parse(prompt.slice(payloadOffset + marker.length));
const articleId = payload.article_ids?.[0];
if (!Number.isSafeInteger(articleId)) process.exit(2);

process.stdout.write(
  `${JSON.stringify({
    version: 1,
    operations: [
      {
        operation: "add_category",
        reference: "github-e2e",
        name: "GitHub E2E",
        parent: null,
        position: 0,
      },
      {
        operation: "set_article_categories",
        article_id: articleId,
        categories: [{ kind: "proposed", reference: "github-e2e" }],
      },
    ],
  })}\n`,
);
