import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../../../", import.meta.url));

const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const worldPlatforms = ["mobile", "desktop"] as const;
const worldSegments = ["foundation", "features", "widgets", "pages"] as const;
const segmentLevel = {
  foundation: 1,
  features: 2,
  widgets: 3,
  pages: 4,
} as const;
const bootstrapLevel = 5;
const bottomLayers = new Set(["kernel", "domain", "protocol", "validation"]);
const foundationSegments = new Set(["api", "styles", "ui"]);
const bootstrapPlatforms = new Set(["desktop", "mobile"]);
const segmentRootSlice = "(segment-root)";

function isWorldSegment(
  value: string | undefined,
): value is (typeof worldSegments)[number] {
  return (worldSegments as readonly string[]).includes(value ?? "");
}

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function subdirectories(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

type Location =
  | { kind: "bootstrap"; platform: string; level: number }
  | {
      kind: "world";
      platform: string;
      segment: (typeof worldSegments)[number];
      slice: string;
      level: number;
    }
  | { kind: "bottom"; level: 0 }
  | { kind: "legacy-app" };

function locate(path: string): Location | undefined {
  const relativePath = relative(frontendRoot, path);
  if (relativePath.startsWith("..")) return undefined;
  const parts = relativePath.split(/[\\/]/);
  const head = parts[0];
  if (head === "app") return { kind: "legacy-app" };
  if (head === "bootstrap") {
    return {
      kind: "bootstrap",
      platform: parts[1] ?? segmentRootSlice,
      level: bootstrapLevel,
    };
  }
  if (bottomLayers.has(head)) return { kind: "bottom", level: 0 };
  if (
    (worldPlatforms as readonly string[]).includes(head) &&
    isWorldSegment(parts[1])
  ) {
    const segment = parts[1];
    return {
      kind: "world",
      platform: head,
      segment,
      slice: parts[2] ?? segmentRootSlice,
      level: segmentLevel[segment],
    };
  }
  return undefined;
}

function importedPaths(file: string, source: string): string[] {
  const paths: string[] = [];
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (specifier?.startsWith(".")) {
      paths.push(resolve(dirname(file), specifier));
    }
  }
  return paths;
}

function newStructureFiles(): string[] {
  const roots = [
    "bootstrap",
    "mobile",
    "desktop",
    "kernel",
    "domain",
    "protocol",
    "validation",
  ];
  return roots.flatMap((name) => walkFiles(join(frontendRoot, name)));
}

function platformOf(location: Location): string | undefined {
  if (location.kind === "world" || location.kind === "bootstrap")
    return location.platform;
  return undefined;
}

test("fsd structure enforces downward dependencies and slice isolation", () => {
  const violations: string[] = [];
  for (const file of newStructureFiles()) {
    const importer = locate(file);
    if (!importer || importer.kind === "legacy-app") continue;
    const source = readFileSync(file, "utf8");
    for (const target of importedPaths(file, source)) {
      const location = locate(target);
      if (!location) continue;
      const violation = dependencyViolation(importer, location, target);
      if (violation) violations.push(`${file}: ${violation}`);
    }
  }
  assert.deepEqual(violations, []);
});

function dependencyViolation(
  importer: Exclude<Location, { kind: "legacy-app" }>,
  target: Location,
  targetPath: string,
): string | undefined {
  if (target.kind === "legacy-app") {
    return `must not import the legacy app shell (${targetPath})`;
  }
  const importerPlatform = platformOf(importer);
  const targetPlatform = platformOf(target);
  if (
    importerPlatform &&
    targetPlatform &&
    importerPlatform !== targetPlatform
  ) {
    return `must not import the ${targetPlatform} platform world (${targetPath})`;
  }
  if (target.level > importer.level) {
    return `imports upward into ${target.kind} (${targetPath})`;
  }
  if (target.level < importer.level) return undefined;
  if (importer.kind === "bottom" && target.kind === "bottom") return undefined;
  if (
    importer.kind === "bootstrap" &&
    target.kind === "bootstrap" &&
    importer.platform === target.platform
  ) {
    return undefined;
  }
  if (
    importer.kind === "world" &&
    target.kind === "world" &&
    importer.platform === target.platform &&
    importer.segment === target.segment
  ) {
    if (importer.segment === "foundation") return undefined;
    if (importer.slice === target.slice) return undefined;
    return `slice "${importer.slice}" must not import sibling slice "${target.slice}" (${targetPath})`;
  }
  return `imports a same-level module outside its slice (${targetPath})`;
}

test("fsd world directories follow the segment layout", () => {
  const violations: string[] = [];
  for (const platform of worldPlatforms) {
    for (const directory of subdirectories(join(frontendRoot, platform))) {
      if (!isWorldSegment(directory)) {
        violations.push(`${platform}/${directory} is not a world segment`);
      }
    }
    for (const segment of worldSegments) {
      if (segment !== "foundation") continue;
      for (const directory of subdirectories(
        join(frontendRoot, platform, segment),
      )) {
        if (!foundationSegments.has(directory)) {
          violations.push(
            `${platform}/foundation/${directory} is not api, styles or ui`,
          );
        }
      }
    }
  }
  for (const directory of subdirectories(join(frontendRoot, "bootstrap"))) {
    if (!bootstrapPlatforms.has(directory)) {
      violations.push(
        `bootstrap/${directory} is not a platform composition root`,
      );
    }
  }
  assert.deepEqual(violations, []);
});

test("kernel stays environment free", () => {
  const violations: string[] = [];
  for (const file of walkFiles(join(frontendRoot, "kernel"))) {
    const source = readFileSync(file, "utf8");
    if (
      /\b(?:fetch|AbortController|window|localStorage|sessionStorage|process)\b/.test(
        source,
      )
    ) {
      violations.push(file);
    }
  }
  assert.deepEqual(violations, []);
});

test("public mobile pages keep host capabilities in bootstrap and logic", () => {
  const pageRoot = join(frontendRoot, "mobile", "pages");
  for (const file of walkFiles(pageRoot).filter((path) =>
    path.endsWith(".tsx"),
  )) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /MobilePageContext/, file);
    assert.doesNotMatch(
      source,
      /\bcontext\.(api|navigation|persistence)\b/,
      file,
    );
  }
});
