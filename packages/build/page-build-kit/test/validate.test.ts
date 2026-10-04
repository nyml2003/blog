import assert from "node:assert/strict";
import test from "node:test";
import { type PageViolation, validatePageRegistry } from "../src/validate.ts";
import {
  alwaysExists,
  desktopShell,
  fixtureRegistrations,
  neverExists,
  withPage,
} from "./fixtures.ts";

function rulesOf(violations: readonly PageViolation[]): Set<string> {
  return new Set(violations.map((violation) => violation.rule));
}

test("the fixture registry has no violations", () => {
  assert.deepEqual(
    [
      ...validatePageRegistry(fixtureRegistrations, {
        entryExists: alwaysExists,
      }),
    ],
    [],
  );
});

test("entry existence goes through the injected dependency", () => {
  const violations = validatePageRegistry(fixtureRegistrations, {
    entryExists: (entry) => entry !== "/bootstrap/desktop/home.tsx",
  });
  assert.deepEqual(rulesOf(violations), new Set(["entry-exists"]));
  assert.equal(violations[0].pageId, "desktop-home");
  assert.equal(
    validatePageRegistry(fixtureRegistrations, { entryExists: neverExists })
      .length,
    fixtureRegistrations.length,
  );
});

test("id must match the manifest key format and stay unique", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { id: "Desktop_Home" }), {
        entryExists: alwaysExists,
      }),
    ).has("id-format"),
  );
  assert.ok(
    rulesOf(
      validatePageRegistry(
        withPage("desktop-archive", { id: "desktop-home" }),
        {
          entryExists: alwaysExists,
        },
      ),
    ).has("id-unique"),
  );
});

test("aliases must exist, follow URL shape, and stay unique", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { aliases: [] }), {
        entryExists: alwaysExists,
      }),
    ).has("alias-required"),
  );
  for (const alias of ["archive", "/a?b", "/a#b"]) {
    assert.ok(
      rulesOf(
        validatePageRegistry(withPage("desktop-home", { aliases: [alias] }), {
          entryExists: alwaysExists,
        }),
      ).has("alias-format"),
      `alias "${alias}" must be rejected`,
    );
  }
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-archive", { aliases: ["/"] }), {
        entryExists: alwaysExists,
      }),
    ).has("alias-unique"),
  );
});

test("an alias must not shadow another page output path", () => {
  const violations = validatePageRegistry(
    withPage("desktop-archive", {
      aliases: ["/desktop/pages/home/index.html"],
    }),
    { entryExists: alwaysExists },
  );
  assert.ok(rulesOf(violations).has("alias-output-path-conflict"));
});

test("output paths must be unique relative paths", () => {
  for (const outputPath of ["/leading/slash", "a//b", "a/../b"]) {
    assert.ok(
      rulesOf(
        validatePageRegistry(withPage("desktop-home", { outputPath }), {
          entryExists: alwaysExists,
        }),
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
        { entryExists: alwaysExists },
      ),
    ).has("output-path-unique"),
  );
});

test("declared platform, output path prefix, and entry prefix must agree", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { platform: "mobile" }), {
        entryExists: alwaysExists,
      }),
    ).has("platform-consistency"),
  );
  assert.ok(
    rulesOf(
      validatePageRegistry(
        withPage("desktop-home", { entry: "/bootstrap/mobile/home.tsx" }),
        { entryExists: alwaysExists },
      ),
    ).has("platform-consistency"),
  );
  assert.ok(
    rulesOf(
      validatePageRegistry(
        withPage("desktop-home", { outputPath: "pages/home/index.html" }),
        { entryExists: alwaysExists },
      ),
    ).has("platform-consistency"),
  );
});

test("entry must be an absolute host-root path", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(
        withPage("desktop-home", { entry: "bootstrap/desktop/home.tsx" }),
        { entryExists: alwaysExists },
      ),
    ).has("entry-format"),
  );
});

test("inline bootstrap and app shell are mobile-only capabilities", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { bootstrap: true }), {
        entryExists: alwaysExists,
      }),
    ).has("bootstrap-mobile-only"),
  );
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { shell: desktopShell }), {
        entryExists: alwaysExists,
      }),
    ).has("shell-mobile-only"),
  );
});

test("title is required", () => {
  assert.ok(
    rulesOf(
      validatePageRegistry(withPage("desktop-home", { title: "  " }), {
        entryExists: alwaysExists,
      }),
    ).has("title-required"),
  );
});
