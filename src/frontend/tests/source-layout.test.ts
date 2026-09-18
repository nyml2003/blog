import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const ignoredDirectories = new Set([".generated", "dist", "node_modules"]);
const testDirectories = new Set(["__tests__", "fixtures", "testing", "tests"]);
const testFilename =
  /(?:\.test|\.spec)\.[cm]?[jt]sx?$|type-test\.[cm]?[jt]sx?$/;
const testOnlyImport = /from\s+["']node:(?:assert(?:\/strict)?|test)["']/;

function sourceTestArtifacts(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirectories.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    const fromRoot = relative(frontendRoot, path);
    const segments = fromRoot.split(sep);
    if (segments[0] === "tests") return [];
    if (entry.isDirectory()) {
      if (testDirectories.has(entry.name)) return [fromRoot];
      return sourceTestArtifacts(path);
    }
    if (!entry.isFile()) return [];
    if (testFilename.test(entry.name)) return [fromRoot];
    if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      const source = readFileSync(path, "utf8");
      if (testOnlyImport.test(source)) return [fromRoot];
    }
    return [];
  });
}

test("frontend test code stays under the tests root", () => {
  assert.deepEqual(sourceTestArtifacts(frontendRoot), []);
});
