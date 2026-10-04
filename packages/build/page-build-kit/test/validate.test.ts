import assert from "node:assert/strict";
import test from "node:test";
import { type PageViolation, validatePageRegistry } from "../src/validate.ts";
import { desktopShell, fixtureRegistrations, withPage } from "./fixtures.ts";

function rulesOf(violations: readonly PageViolation[]): Set<string> {
  return new Set(violations.map((violation) => violation.rule));
}

test("the fixture registry has no violations", () => {
  assert.deepEqual([...validatePageRegistry(fixtureRegistrations)], []);
});

test("id must match the manifest key format and stay unique", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { id: "Desktop_Home" })),
    ).has("id-format"),
  );
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-archive", { id: "desktop-home" })),
    ).has("id-unique"),
  );
});

test("aliases must exist, follow URL shape, and stay unique", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { aliases: [] })),
    ).has("alias-required"),
  );
  for (const alias of ["archive", "/a?b", "/a#b"]) {
    assert.ok(
      rulesOf(
        validatePageRegistry(withPage("desktop-home", { aliases: [alias] })),
      ).has("alias-format"),
      `alias "${alias}" must be rejected`,
    );
  }
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-archive", { aliases: ["/"] })),
    ).has("alias-unique"),
  );
});

test("an alias must not shadow another page output path", () => {
  const violations = validatePageRegistry(
    withPage("desktop-archive", {
      aliases: ["/desktop/pages/home/index.html"],
    }),
  );
  assert.ok(rulesOf(violations).has("alias-output-path-conflict"));
});

test("output paths must be unique relative paths", () => {
  for (const outputPath of ["/leading/slash", "a//b", "a/../b"]) {
    assert.ok(
      rulesOf(
        validatePageRegistry(withPage("desktop-home", { outputPath })),
      ).has("output-path-format"),
      `outputPath "${outputPath}" must be rejected`,
    );
  }
  assert.ok(
    rulesOf(
      validatePageRegistry(
        withPage("desktop-archive", {
          outputPath: "desktop/pages/home/index.html",
        }),
      ),
    ).has("output-path-unique"),
  );
});

test("declared platform must match the output path prefix", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { platform: "mobile" })),
    ).has("platform-consistency"),
  );
  assert.ok(
    rulesOf(
      validatePageRegistry(
        withPage("desktop-home", { outputPath: "pages/home/index.html" }),
      ),
    ).has("platform-consistency"),
  );
});

test("inline bootstrap and app shell are mobile-only capabilities", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { bootstrap: true })),
    ).has("bootstrap-mobile-only"),
  );
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { shell: desktopShell })),
    ).has("shell-mobile-only"),
  );
});

test("title is required", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { title: "  " })),
    ).has("title-required"),
  );
});
