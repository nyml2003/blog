import assert from "node:assert/strict";
import test from "node:test";
import { createWebDocument } from "@fluvient-loom/web";

function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    root: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
    },
  };
}

test("web document writes and reads root attributes", () => {
  const fake = fakeRoot();
  const document = createWebDocument({ root: fake.root });
  assert.equal(document.readRootAttribute("data-theme"), undefined);
  document.writeRootAttribute("data-theme", "sepia");
  document.writeRootAttribute("data-font", "serif");
  assert.equal(document.readRootAttribute("data-theme"), "sepia");
  assert.equal(document.readRootAttribute("data-font"), "serif");
});

test("constructing without a document fails eagerly", () => {
  assert.throws(() => createWebDocument(), /document/);
});
