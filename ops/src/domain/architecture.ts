import { dirname, normalize, resolve } from "node:path";

export interface Violation {
  file: string;
  message: string;
}

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function normalized(file: string): string {
  return normalize(file).replaceAll("\\", "/");
}

function importedModules(file: string, source: string): string[] {
  const modules: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    if (specifier.startsWith(".")) {
      modules.push(normalized(resolve(dirname(file), specifier)));
      continue;
    }
    modules.push(specifier);
  }
  return modules;
}

/** Import paths like `./document` must not be mistaken for environment globals. */
function withoutImports(source: string): string {
  return source.replace(new RegExp(IMPORT_PATTERN.source, "g"), " ");
}

function containsPath(module: string, path: string): boolean {
  return module.includes(`/src/frontend/${path}`);
}

function isPage(file: string): boolean {
  return /\/src\/frontend\/(?:desktop|mobile)\/src\/pages\//.test(file);
}

function isUiComponent(file: string): boolean {
  return (
    /\/src\/frontend\/(?:desktop|mobile)\/src\/components\//.test(file) ||
    file.includes("/src/frontend/desktop-ui/") ||
    file.includes("/src/frontend/mobile-ui/") ||
    (!isPage(file) &&
      /\/src\/frontend\/(?:desktop|mobile)\/src\/.*\.tsx$/.test(file))
  );
}

function isAppModule(file: string): boolean {
  return file.includes("/src/frontend/app/");
}

function isKernelModule(file: string): boolean {
  return file.includes("/src/frontend/app/kernel/");
}

function isInfrastructureModule(file: string): boolean {
  return file.includes("/src/frontend/app/infrastructure/");
}

function isHabitatApiModule(file: string): boolean {
  return file.includes("/src/frontend/app/habitat/api/");
}

function isHabitatMobileModule(file: string): boolean {
  return file.includes("/src/frontend/app/habitat/mobile/");
}

function isBootstrapModule(file: string): boolean {
  return file.includes("/src/frontend/app/bootstrap/");
}

function isLegacyFrontendModule(module: string): boolean {
  return [
    "common/",
    "solid/",
    "desktop/",
    "mobile/",
    "desktop-ui/",
    "mobile-ui/",
  ].some((path) => containsPath(module, path));
}

function checkFrontendFile(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const modules = importedModules(file, source);
  const importsDesktopUi = modules.some(
    (module) =>
      containsPath(module, "desktop/") || containsPath(module, "desktop-ui/"),
  );
  const importsMobileUi = modules.some(
    (module) =>
      containsPath(module, "mobile/") || containsPath(module, "mobile-ui/"),
  );

  if (isAppModule(file) && modules.some(isLegacyFrontendModule)) {
    violations.push({
      file,
      message: "new app foundation must not import the legacy frontend runtime",
    });
  }

  if (isKernelModule(file)) {
    const importsEnvironment = modules.some(
      (module) =>
        module === "solid-js" ||
        module === "solid-js/web" ||
        module.startsWith("node:") ||
        /(?:^|\/)(?:zod|desktop-ui|mobile-ui|common|solid|desktop|mobile)(?:\/|$)/.test(module),
    );
    if (importsEnvironment || /\b(?:fetch|AbortController|window|document|localStorage|sessionStorage|process)\b/.test(withoutImports(source))) {
      violations.push({
        file,
        message: "kernel must remain environment and framework independent",
      });
    }
  }

  if (isInfrastructureModule(file)) {
    const importsOutsideFoundation = modules.some((module) => {
      if (module.startsWith("/")) {
        return !module.includes("/src/frontend/app/kernel/") && !module.includes("/src/frontend/app/infrastructure/");
      }
      return true;
    });
    const importsForbidden = modules.some(
      (module) =>
        module === "zod" ||
        module === "solid-js" ||
        module === "solid-js/web" ||
        isLegacyFrontendModule(module),
    );
    if (importsOutsideFoundation || importsForbidden || /\bsceneCode\b|["']\/api\//.test(source)) {
      violations.push({
        file,
        message: "infrastructure must not depend on business API or UI modules",
      });
    }
  }

  if (isHabitatApiModule(file)) {
    const importsForbidden = modules.some(
      (module) =>
        module === "solid-js" ||
        module === "solid-js/web" ||
        module.includes("/src/frontend/app/infrastructure/") ||
        isLegacyFrontendModule(module),
    );
    if (importsForbidden) {
      violations.push({
        file,
        message: "API habitat must depend on kernel contracts, not adapters or UI",
      });
    }
  }

  if (isHabitatMobileModule(file)) {
    const importsInfrastructure = modules.some((module) =>
      module.includes("/src/frontend/app/infrastructure/"),
    );
    if (importsInfrastructure || modules.some(isLegacyFrontendModule)) {
      violations.push({
        file,
        message: "mobile habitat must not depend on infrastructure or legacy frontend",
      });
    }
  }

  if (isBootstrapModule(file) && modules.some(isLegacyFrontendModule)) {
    violations.push({
      file,
      message: "bootstrap must not depend on the legacy frontend runtime",
    });
  }

  if (
    (file.includes("/src/frontend/desktop/") ||
      file.includes("/src/frontend/desktop-ui/")) &&
    importsMobileUi
  ) {
    violations.push({ file, message: "desktop must not import mobile UI" });
  }
  if (
    (file.includes("/src/frontend/mobile/") ||
      file.includes("/src/frontend/mobile-ui/")) &&
    importsDesktopUi
  ) {
    violations.push({ file, message: "mobile must not import desktop UI" });
  }

  const isCommonClient = file.includes("/src/frontend/common/client/");
  if (file.includes("/src/frontend/common/") && !isCommonClient) {
    const importsUi =
      importsDesktopUi ||
      importsMobileUi ||
      modules.some(
        (module) => module === "solid-js" || module === "solid-js/web",
      );
    if (file.endsWith(".tsx") || importsUi) {
      violations.push({ file, message: "common must not depend on UI" });
    }
  }

  if (isPage(file)) {
    const importsDataMechanism = modules.some(
      (module) =>
        containsPath(module, "common/client") ||
        containsPath(module, "common/data") ||
        containsPath(module, "solid/data"),
    );
    if (importsDataMechanism) {
      violations.push({
        file,
        message:
          "pages must use the query layer instead of client/data modules",
      });
    }
  }

  if (isUiComponent(file)) {
    const importsDataAccess = modules.some(
      (module) =>
        containsPath(module, "common/client") ||
        containsPath(module, "common/data"),
    );
    if (importsDataAccess) {
      violations.push({
        file,
        message: "UI components must not import client/data modules",
      });
    }
  }

  if (file.includes("/src/frontend/solid/queries/")) {
    const importsUi = modules.some(
      (module) =>
        containsPath(module, "desktop/") ||
        containsPath(module, "desktop-ui/") ||
        containsPath(module, "mobile/") ||
        containsPath(module, "mobile-ui/"),
    );
    if (importsUi) {
      violations.push({
        file,
        message: "query modules must not import pages or UI modules",
      });
    }
  }

  if (isCommonClient) {
    const importsSolid = modules.some(
      (module) => module === "solid-js" || module === "solid-js/web",
    );
    if (importsSolid || importsDesktopUi || importsMobileUi) {
      violations.push({
        file,
        message: "common client must remain framework independent",
      });
    }
  }

  return violations;
}

function checkRustFile(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const httpFiltersContentSnapshot =
    /(?<![.\w])snapshot\s*\.\s*(?:articles|taxonomy\s*\.\s*categories)\s*\.\s*iter\s*\(\s*\)\s*\.(?:filter|filter_map)\s*\(/.test(
      source,
    );
  const httpComputesTaxonomyDescendants =
    /\b(?:is_descendant|descendant_category_ids|collect_descendant_ids)\s*\(/.test(
      source,
    );
  const productHttpOwnsBffDecision =
    /\binclude_recommendation\b/.test(source) ||
    /\b(?:group|partition|sort|truncate)_(?:articles|sections|recommendations)\b/i.test(
      source,
    ) ||
    /\.(?:group_by|partition|sort_by|sort_by_key|truncate)\s*\(/.test(source) ||
    /\.take\s*\(\s*\d+\s*\)/.test(source) ||
    /["'](?:未分类|uncategorized)["']/i.test(source) ||
    httpFiltersContentSnapshot ||
    httpComputesTaxonomyDescendants;
  if (
    file.endsWith("/src/backend/product/src/http.rs") &&
    productHttpOwnsBffDecision
  ) {
    violations.push({
      file,
      message: "product HTTP adapter must not own BFF decisions",
    });
  }

  const protocolOwnsShelfComposition =
    /\bto_shelf\b/.test(source) ||
    /\b(?:assemble|compose|group|partition|sort|truncate)[a-z0-9_]*shelf\b/i.test(
      source,
    ) ||
    /\b(?:group|partition|sort|truncate)_(?:articles|sections|recommendations)\b/i.test(
      source,
    ) ||
    /\.(?:group_by|partition|sort_by|sort_by_key|truncate)\s*\(/.test(source) ||
    /\.take\s*\(\s*\d+\s*\)/.test(source) ||
    /["'](?:未分类|uncategorized)["']/i.test(source);
  if (file.includes("/src/core/protocol/") && protocolOwnsShelfComposition) {
    violations.push({
      file,
      message: "protocol must not own shelf composition",
    });
  }
  const isProductDataClient = file.endsWith(
    "/backend/product/src/data_client.rs",
  );
  if (
    file.includes("/src/backend/product/") &&
    !isProductDataClient &&
    /\b(?:sqlx|rusqlite|SqliteConnection|SqlitePool)\b/.test(source)
  ) {
    violations.push({
      file,
      message: "product must not access SQLite directly",
    });
  }
  if (
    file.includes("/src/backend/data/") &&
    /\b(?:article_html_core|ammonia|html5ever|kuchiki|lol_html|scraper)\b/i.test(
      source,
    )
  ) {
    violations.push({
      file,
      message: "data domain and storage must not parse HTML",
    });
  }
  if (
    file.includes("/src/backend/data/") &&
    /\b(?:github|octocrab)\b/i.test(source)
  ) {
    violations.push({
      file,
      message: "data domain and storage must not access GitHub",
    });
  }

  const isDataHttpAdapter =
    file.endsWith("/src/backend/data/src/http.rs") ||
    file.endsWith("/src/backend/data/src/server.rs") ||
    file.endsWith("/src/backend/data/src/main.rs") ||
    file.endsWith("/src/backend/data/src/cli.rs");
  const dataOwnsHttpDependency =
    /(?:^|\n)\s*(?:use|extern\s+crate)\s+(?:axum|http|http_body_util|hyper|reqwest|tower_http|ureq)\b/m.test(
      source,
    ) ||
    /\b(?:axum|http|http_body_util|hyper|reqwest|tower_http|ureq)::/.test(
      source,
    );
  if (
    file.includes("/src/backend/data/src/") &&
    !isDataHttpAdapter &&
    dataOwnsHttpDependency
  ) {
    violations.push({
      file,
      message: "data domain and storage must not depend on HTTP",
    });
  }
  return violations;
}

function checkCargoManifest(file: string, source: string): Violation[] {
  if (!file.endsWith("/src/backend/data/Cargo.toml")) return [];
  const violations: Violation[] = [];
  const hasHtmlParser =
    /^(?:article-html-core|ammonia|html5ever|kuchiki|lol_html|scraper)\s*=/im.test(
      source,
    );
  if (hasHtmlParser) {
    violations.push({ file, message: "data must not depend on HTML parsers" });
  }
  const hasExternalClient =
    /^(?:reqwest|ureq|octocrab|github(?:-api|-rs)?)\s*=/im.test(source);
  if (hasExternalClient) {
    violations.push({
      file,
      message: "data must not depend on external HTTP or GitHub clients",
    });
  }
  return violations;
}

export function checkArchitectureBoundaries(
  files: readonly string[],
  source: (file: string) => string,
): Violation[] {
  return files.flatMap((rawFile) => {
    const file = normalized(rawFile);
    const text = source(rawFile);
    if (/\.(?:ts|tsx)$/.test(file)) return checkFrontendFile(file, text);
    if (file.endsWith(".rs")) return checkRustFile(file, text);
    if (file.endsWith("Cargo.toml")) return checkCargoManifest(file, text);
    return [];
  });
}
