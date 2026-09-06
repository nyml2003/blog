import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(
  "sqlite3",
  [
    "-readonly",
    "-json",
    "blog.db",
    "SELECT id,status,content_html FROM articles ORDER BY id;",
  ],
  { cwd: workspace, encoding: "utf8" },
);
if (result.status !== 0) throw new Error(result.stderr);
const rows = JSON.parse(result.stdout);
const check = spawnSync(
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
    input: JSON.stringify(rows.map((row) => row.content_html)),
    encoding: "utf8",
  },
);
if (check.status !== 0) throw new Error(check.stderr);
const inspections = JSON.parse(check.stdout);
console.log(
  JSON.stringify(
    {
      database: "blog.db",
      count: rows.length,
      maxBytes: Math.max(
        0,
        ...rows.map((row) => Buffer.byteLength(row.content_html)),
      ),
      rows: rows.map((row, index) => ({
        id: row.id,
        status: row.status,
        profileVersion: inspections[index].profileVersion,
        valid: inspections[index].valid,
        codes: inspections[index].diagnostics.map(
          (diagnostic) => diagnostic.code,
        ),
      })),
    },
    null,
    2,
  ),
);
