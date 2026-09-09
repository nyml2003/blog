#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const [phase, baseUrl] = process.argv.slice(2);
const password = process.env.BLOG_E2E_PASSWORD;
const recoveryCode = process.env.BLOG_E2E_RECOVERY_CODE;
const stateFile = process.env.BLOG_E2E_STATE_FILE;

if (
  !["prepare", "after-merge"].includes(phase) ||
  !baseUrl ||
  !password ||
  !recoveryCode ||
  !stateFile
) {
  process.exit(2);
}

let cookie;

const call = async (path, method = "GET", body) => {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie !== undefined) headers.cookie = cookie;
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} returned non-JSON status ${response.status}`);
  }
  return { response, envelope };
};

const expectOk = async (path, method = "GET", body) => {
  const result = await call(path, method, body);
  if (result.response.status !== 200 || result.envelope.code !== "OK") {
    throw new Error(
      `${method} ${path} failed: ${result.response.status} ${result.envelope.code}`,
    );
  }
  return result.envelope.data;
};

const login = async () => {
  const result = await call("/api/admin/session", "POST", {
    sceneCode: "admin.session.create",
    password,
    verification: { kind: "recovery", code: recoveryCode },
  });
  if (result.response.status !== 200 || result.envelope.code !== "OK") {
    throw new Error(`login failed: ${result.response.status} ${result.envelope.code}`);
  }
  cookie = result.response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("login response did not set a session cookie");
};

const workspace = () =>
  expectOk(
    "/api/admin/content/workspace?sceneCode=admin.content_workspace",
  );

const saveArticle = (expectedVersion, article) =>
  expectOk("/api/admin/content/articles", "POST", {
    sceneCode: "admin.content_article_save",
    expectedVersion,
    article,
  });

await login();

if (phase === "prepare") {
  const initial = await workspace();
  if (
    initial.status !== "clean" ||
    initial.pullRequest !== null ||
    initial.articles.length !== 0 ||
    initial.taxonomy.categories.length !== 0
  ) {
    throw new Error("E2E repository did not start from an empty workspace");
  }

  const created = await saveArticle(initial.version, {
    title: "GitHub workflow acceptance",
    summary: "A real GitHub PR and synchronization acceptance article.",
    categoryIds: [],
    tagIds: [],
    contentHtml: "<p>First accepted version.</p>",
  });

  await expectOk("/api/admin/content/taxonomy/analyze", "POST", {
    sceneCode: "admin.content_taxonomy_analyze",
    expectedVersion: created.workspace.version,
    articleIds: [created.article.id],
  });

  const preview = await expectOk(
    "/api/admin/content/preview?sceneCode=admin.content_preview",
  );
  if (!preview.diff || preview.taxonomy.categories.length !== 1) {
    throw new Error("model analysis did not produce the expected normalized diff");
  }

  const beforeReview = await call("/api/admin/content/submit", "POST", {
    sceneCode: "admin.content_submit",
    expectedVersion: created.workspace.version,
  });
  if (
    beforeReview.response.status !== 409 ||
    beforeReview.envelope.code !== "PENDING_REVIEW_REQUIRED"
  ) {
    throw new Error("submit before review was not rejected");
  }

  const reviewed = await expectOk(
    "/api/admin/content/taxonomy/review",
    "POST",
    {
      sceneCode: "admin.content_taxonomy_review",
      expectedVersion: created.workspace.version,
    },
  );
  const firstSubmission = await expectOk(
    "/api/admin/content/submit",
    "POST",
    {
      sceneCode: "admin.content_submit",
      expectedVersion: reviewed.version,
    },
  );

  const category = reviewed.taxonomy.categories.find(
    (value) => value.name === "GitHub E2E",
  );
  if (!category) throw new Error("reviewed taxonomy is missing the E2E category");

  const edited = await saveArticle(reviewed.version, {
    id: created.article.id,
    title: "GitHub workflow acceptance",
    summary: "The existing open PR was updated without creating another PR.",
    categoryIds: [category.id],
    tagIds: [],
    contentHtml: "<p>Updated on the same pull request.</p>",
  });
  const secondSubmission = await expectOk(
    "/api/admin/content/submit",
    "POST",
    {
      sceneCode: "admin.content_submit",
      expectedVersion: edited.workspace.version,
    },
  );
  if (
    secondSubmission.pullRequest.number !== firstSubmission.pullRequest.number
  ) {
    throw new Error("updating an active batch created a second pull request");
  }

  const pending = await saveArticle(edited.workspace.version, {
    title: "Post-submit local draft",
    summary: "This draft must remain local when the first PR is merged.",
    categoryIds: [category.id],
    tagIds: [],
    contentHtml: "<p>Next batch.</p>",
  });

  const state = {
    firstPullRequest: firstSubmission.pullRequest,
    articleAId: created.article.id,
    articleBId: pending.article.id,
    pendingVersion: pending.workspace.version,
  };
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(state)}\n`);
  process.exit(0);
}

const state = JSON.parse(readFileSync(stateFile, "utf8"));
await expectOk("/api/admin/content/sync", "POST", {
  sceneCode: "admin.content_sync",
});
const synchronized = await workspace();
const articleB = synchronized.articles.find(
  (article) => article.id === state.articleBId,
);
if (!articleB || synchronized.pullRequest !== null) {
  throw new Error("post-submit local draft was not retained after merged sync");
}

const publicArticles = await expectOk(
  "/api/public/articles?sceneCode=public.article_list&pageSize=100",
);
if (!publicArticles.items.some((article) => article.id === state.articleAId)) {
  throw new Error("merged article is missing from the public snapshot");
}
if (publicArticles.items.some((article) => article.id === state.articleBId)) {
  throw new Error("unsubmitted local draft leaked into the public snapshot");
}

const secondBatch = await expectOk(
  "/api/admin/content/submit",
  "POST",
  {
    sceneCode: "admin.content_submit",
    expectedVersion: synchronized.version,
  },
);
if (secondBatch.pullRequest.number === state.firstPullRequest.number) {
  throw new Error("a merged batch was reused instead of creating a new PR");
}

const result = {
  firstPullRequest: state.firstPullRequest,
  secondPullRequest: secondBatch.pullRequest,
  synchronizedVersion: synchronized.version,
  publicArticleId: state.articleAId,
  pendingArticleId: state.articleBId,
};
writeFileSync(stateFile, `${JSON.stringify(result, null, 2)}\n`, {
  mode: 0o600,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
