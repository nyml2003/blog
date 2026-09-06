import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../", import.meta.url));
assert.equal(
  process.argv[2],
  "--reset-local-test-articles",
  "Explicit test-data reset flag required",
);
const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "../docs/plans/archive/PLAN-ARTICLE-HTML-VALIDATION-001/fixtures/article-html-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const entries = fixtures.cases.filter((entry) =>
  [
    "representative-article",
    "safe-https-link",
    "safe-http-link-rel-order",
  ].includes(entry.id),
);
assert.equal(entries.length, 3);
const inspection = spawnSync(
  "cargo",
  [
    "run",
    "--quiet",
    "--locked",
    "-p",
    "article-html-core",
    "--example",
    "inspect",
  ],
  {
    cwd: workspace,
    encoding: "utf8",
    input: JSON.stringify(entries.map((entry) => entry.source)),
  },
);
assert.equal(inspection.status, 0, inspection.stderr);
assert.ok(JSON.parse(inspection.stdout).every((result) => result.valid));

const backupDirectory = `${workspace}src/target/html-validation/backups`;
mkdirSync(backupDirectory, { recursive: true });
const backupPath = `${backupDirectory}/blog-before-html-v1-${Date.now()}.db`;
const backup = spawnSync("sqlite3", ["blog.db", `.backup '${backupPath}'`], {
  cwd: workspace,
  encoding: "utf8",
});
assert.equal(backup.status, 0, backup.stderr);

const db = new DatabaseSync(`${workspace}blog.db`);
try {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
  const previousCount = db
    .prepare("SELECT count(*) AS count FROM articles")
    .get().count;
  const articleType = db
    .prepare("SELECT id FROM article_types ORDER BY id LIMIT 1")
    .get();
  assert.ok(articleType, "At least one article type must exist");
  db.exec(
    "DELETE FROM recommendation_items; DELETE FROM article_terms; DELETE FROM articles;",
  );
  const insert = db.prepare(
    "INSERT INTO articles (title,summary,article_type_id,content_html,status,created_at,updated_at,published_at) VALUES (?,?,?,?,'published',?,?,?)",
  );
  const stamp = new Date().toISOString();
  const ids = entries.map((entry) =>
    Number(
      insert.run(
        `HTML v1: ${entry.id}`,
        "Strict article-html/v1 fixture",
        articleType.id,
        entry.source,
        stamp,
        stamp,
        stamp,
      ).lastInsertRowid,
    ),
  );
  let activeSet = db
    .prepare("SELECT id FROM recommendation_sets WHERE is_active=1")
    .get();
  if (!activeSet) {
    activeSet = {
      id: Number(
        db
          .prepare(
            "INSERT INTO recommendation_sets (created_at,is_active) VALUES (?,1)",
          )
          .run(stamp).lastInsertRowid,
      ),
    };
  }
  const recommend = db.prepare(
    "INSERT INTO recommendation_items (recommendation_set_id,article_id,position) VALUES (?,?,?)",
  );
  ids.forEach((id, index) => recommend.run(activeSet.id, id, index));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.exec("COMMIT");
  console.log(
    JSON.stringify({
      database: "blog.db",
      backupPath,
      previousCount,
      rebuiltCount: ids.length,
      articleIds: ids,
      profileVersion: fixtures.profileVersion,
    }),
  );
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
