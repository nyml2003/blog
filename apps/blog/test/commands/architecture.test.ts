import assert from "node:assert/strict";
import test from "node:test";
import { checkArchitectureBoundaries } from "../../src/quality/architecture.ts";

function check(file: string, source: string): readonly string[] {
  return checkArchitectureBoundaries([file], () => source).map(
    (violation) => violation.message,
  );
}

test("data manifest rejects HTML parser dependencies", () => {
  assert.deepEqual(
    check(
      "/repo/src/backend/data/Cargo.toml",
      '[dependencies]\narticle-html-core = { path = "../../core/article-html-core" }',
    ),
    ["data must not depend on HTML parsers"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/data/Cargo.toml",
      '[dependencies]\nsqlx = { workspace = true }\naxum = { workspace = true }',
    ),
    [],
  );
});

test("data manifest rejects external HTTP or GitHub clients", () => {
  assert.deepEqual(
    check(
      "/repo/src/backend/data/Cargo.toml",
      '[dev-dependencies]\nreqwest = "0.12"\noctocrab = "0.44"',
    ),
    ["data must not depend on external HTTP or GitHub clients"],
  );
  assert.deepEqual(check("/repo/src/backend/data/Cargo.toml", '[dependencies]\ntempfile = "3"'), []);
});

test("product manifest rejects direct SQLite access but allows its own stack", () => {
  assert.deepEqual(
    check(
      "/repo/src/backend/product/Cargo.toml",
      '[dependencies]\nsqlx = { workspace = true }',
    ),
    ["product must not access SQLite directly"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/product/Cargo.toml",
      '[dependencies]\nureq = { version = "2.12" }\narticle-html-core = { path = "../../core/article-html-core" }',
    ),
    [],
  );
});

test("source files and unrelated manifests are not scanned", () => {
  assert.deepEqual(
    check(
      "/repo/src/frontend/kernel/desired-state.ts",
      "window.alert(1); fetch('/api');",
    ),
    [],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/product/src/http.rs",
      "let sorted: Vec<_> = snapshot.articles.iter().collect();",
    ),
    [],
  );
  assert.deepEqual(
    check("/repo/src/backend/other/Cargo.toml", '[dependencies]\nreqwest = "1"'),
    [],
  );
});
