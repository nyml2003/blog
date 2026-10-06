import type { PathPort } from "@fluvient-cli/cli-kit/ports.ts";

export interface Violation {
  file: string;
  message: string;
}

function normalized(file: string, path: PathPort): string {
  return path.normalize(file).replaceAll("\\", "/");
}

// 源码内容扫描（前端 import 建图、Rust 内容启发式）已于 2026-10-04 退役；
// 依赖禁令只看 Cargo manifest，与包边界模型对齐。背景见 SPEC-ARCH-BOUNDARY-001。
function checkCargoManifest(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const declares = (crate: string) =>
    new RegExp(`^${crate}\\s*=`, "im").test(source);
  if (file.endsWith("/src/backend/data/Cargo.toml")) {
    if (
      [
        "article-html-core",
        "ammonia",
        "html5ever",
        "kuchiki",
        "lol_html",
        "scraper",
      ].some(declares)
    ) {
      violations.push({ file, message: "data must not depend on HTML parsers" });
    }
    if (
      ["reqwest", "ureq", "octocrab", "github", "github-api", "github-rs"].some(
        declares,
      )
    ) {
      violations.push({
        file,
        message: "data must not depend on external HTTP or GitHub clients",
      });
    }
  }
  if (
    file.endsWith("/src/backend/product/Cargo.toml") &&
    ["sqlx", "rusqlite"].some(declares)
  ) {
    violations.push({
      file,
      message: "product must not access SQLite directly",
    });
  }
  return violations;
}

export function checkArchitectureBoundaries(
  files: readonly string[],
  source: (file: string) => string,
  path: PathPort,
): Violation[] {
  return files.flatMap((rawFile) => {
    const file = normalized(rawFile, path);
    if (!file.endsWith("Cargo.toml")) return [];
    return checkCargoManifest(file, source(rawFile));
  });
}
