import assert from "node:assert/strict";
import test from "node:test";
import { generateSiteRoutesManifest } from "../src/generate.ts";
import { fixtureRegistrations } from "./fixtures.ts";
import { pageRoutes } from "../src/types.ts";

test("canonical route is the first declared alias", () => {
  const manifest = JSON.parse(generateSiteRoutesManifest(fixtureRegistrations));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.routes["mobile-home"], "/m/");
  for (const page of fixtureRegistrations) {
    assert.equal(manifest.routes[page.id], page.aliases[0]);
  }
});

test("manifest output is stable and byte-formatted", () => {
  const first = generateSiteRoutesManifest(fixtureRegistrations);
  assert.equal(first, generateSiteRoutesManifest(fixtureRegistrations));
  assert.ok(first.startsWith('{\n  "version": 1,\n  "routes": {\n'));
  assert.ok(first.endsWith("  }\n}\n"));
});

test("pageRoutes flattens aliases in declaration order", () => {
  assert.deepEqual(
    pageRoutes(fixtureRegistrations).map((r) => r.alias),
    ["/", "/archive/index.html", "/m/", "/m"],
  );
});
