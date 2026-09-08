import assert from "node:assert/strict";
import test from "node:test";
import { checkArchitectureBoundaries } from "./architecture.ts";

function check(file: string, source: string): readonly string[] {
  return checkArchitectureBoundaries([file], () => source).map(
    (violation) => violation.message,
  );
}

test("rejects page data access and accepts query-layer imports", () => {
  assert.deepEqual(
    check(
      "/repo/src/frontend/desktop/src/pages/public/home.tsx",
      'import { browserClient } from "../../../../common/client";',
    ),
    ["pages must use the query layer instead of client/data modules"],
  );
  assert.deepEqual(
    check(
      "/repo/src/frontend/desktop/src/pages/public/home.tsx",
      'import { usePublicHome } from "../../../../solid/queries";',
    ),
    [],
  );
});

test("rejects cross-platform UI imports", () => {
  assert.deepEqual(
    check(
      "/repo/src/frontend/desktop/src/pages/public/home.tsx",
      'import { Shelf } from "../../../../mobile/src/components/shelf";',
    ),
    ["desktop must not import mobile UI"],
  );
  assert.deepEqual(
    check(
      "/repo/src/frontend/mobile/src/pages/home.tsx",
      'import { Shelf } from "../../../desktop/src/components/shelf";',
    ),
    ["mobile must not import desktop UI"],
  );
});

test("keeps common and query modules free of UI dependencies", () => {
  assert.deepEqual(
    check(
      "/repo/src/frontend/common/page.ts",
      'import { render } from "solid-js/web";',
    ),
    ["common must not depend on UI"],
  );
  assert.deepEqual(
    check(
      "/repo/src/frontend/solid/queries/public.ts",
      'import { Shelf } from "../../mobile/src/components/shelf";',
    ),
    ["query modules must not import pages or UI modules"],
  );
});

test("rejects client framework imports and UI-component data access", () => {
  assert.deepEqual(
    check(
      "/repo/src/frontend/common/client/client.ts",
      'import { createSignal } from "solid-js";',
    ),
    ["common client must remain framework independent"],
  );
  assert.deepEqual(
    check(
      "/repo/src/frontend/mobile/src/components/shelf.tsx",
      'import { browserClient } from "../../../common/client";',
    ),
    ["UI components must not import client/data modules"],
  );
  assert.deepEqual(
    check(
      "/repo/src/frontend/desktop/src/app.tsx",
      'import { browserClient } from "../../common/client";',
    ),
    ["UI components must not import client/data modules"],
  );
  assert.deepEqual(
    check(
      "/repo/src/frontend/common/client/client.ts",
      'import { Header } from "../../desktop/src/app";',
    ),
    ["common client must remain framework independent"],
  );
});

test("enforces protocol, Product, and Data boundaries", () => {
  assert.deepEqual(
    check(
      "/repo/src/backend/product/src/http.rs",
      "articles.sort_by_key(|article| article.updated_at); articles.truncate(3);",
    ),
    ["product HTTP adapter must not own BFF decisions"],
  );
  assert.deepEqual(
    check("/repo/src/core/protocol/src/wire.rs", "pub fn to_shelf() {}"),
    ["protocol must not own shelf composition"],
  );
  assert.deepEqual(
    check(
      "/repo/src/core/protocol/src/wire.rs",
      "pub fn compose_mobile_shelf() {}",
    ),
    ["protocol must not own shelf composition"],
  );
  assert.deepEqual(
    check("/repo/src/backend/product/src/http.rs", "use sqlx::SqlitePool;"),
    ["product must not access SQLite directly"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/data/src/store.rs",
      "article_html_core::inspect(html);",
    ),
    ["data domain and storage must not parse HTML"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/data/src/store/github.rs",
      "use octocrab::Octocrab;",
    ),
    ["data domain and storage must not access GitHub"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/data/src/store/sqlite.rs",
      "use reqwest::Client; let request = http::Request::new(body);",
    ),
    ["data domain and storage must not depend on HTTP"],
  );
});

test("rejects category shelf decisions in the Product HTTP adapter", () => {
  const directSnapshotFiltering = `
    let leaves: BTreeSet<_> = snapshot
      .taxonomy
      .categories
      .iter()
      .filter(|category| !parent_ids.contains(&category.id))
      .collect();
    let articles: Vec<_> = snapshot
      .articles
      .iter()
      .filter(|article| article.meta.published_at.is_some())
      .collect();
  `;
  assert.deepEqual(
    check("/repo/src/backend/product/src/http.rs", directSnapshotFiltering),
    ["product HTTP adapter must not own BFF decisions"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/product/src/http.rs",
      "fn is_descendant(parents: &Parents, leaf: i64, root: i64) -> bool { true }",
    ),
    ["product HTTP adapter must not own BFF decisions"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/product/src/http.rs",
      "let shelf = bff::category_shelf::assemble(&snapshot, selected)?;",
    ),
    [],
  );
});

test("rejects HTML parser dependencies in the Data manifest", () => {
  assert.deepEqual(
    check(
      "/repo/src/backend/data/Cargo.toml",
      '[dependencies]\narticle-html-core = { path = "../../core/article-html-core" }',
    ),
    ["data must not depend on HTML parsers"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/product/Cargo.toml",
      '[dependencies]\narticle-html-core = { path = "../../core/article-html-core" }',
    ),
    [],
  );
});

test("rejects external HTTP and GitHub clients in the Data manifest", () => {
  assert.deepEqual(
    check(
      "/repo/src/backend/data/Cargo.toml",
      '[dependencies]\nreqwest = "0.12"\noctocrab = "0.44"',
    ),
    ["data must not depend on external HTTP or GitHub clients"],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/data/Cargo.toml",
      '[dependencies]\naxum = "0.8"\nhttp = "1"',
    ),
    [],
  );
});

test("allows Product data client, Data HTTP adapter, and typed Data storage", () => {
  assert.deepEqual(
    check("/repo/src/backend/product/src/data_client.rs", "struct DataClient;"),
    [],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/data/src/store/sqlite.rs",
      "use sqlx::SqlitePool;",
    ),
    [],
  );
  assert.deepEqual(
    check(
      "/repo/src/backend/data/src/http.rs",
      "use axum::Router; use axum::http::StatusCode;",
    ),
    [],
  );
});
