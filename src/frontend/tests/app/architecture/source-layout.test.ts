import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../../../app");
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test("new app layers keep legacy and dependency boundaries", () => {
  for (const file of files(root).filter((path) => /\.tsx?$/.test(path))) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /(?:src\/frontend\/(?:common|solid|desktop|mobile)|from ["'](?:desktop-ui|mobile-ui))/,
    );
    if (file.includes("/kernel/")) {
      assert.doesNotMatch(
        source,
        /\b(?:fetch|AbortController|window|localStorage|sessionStorage|process)\b/,
      );
    }
    if (file.includes("/infrastructure/")) {
      assert.doesNotMatch(source, /from ["'](?:zod|solid-js|solid-js\/web)/);
    }
  }
});
