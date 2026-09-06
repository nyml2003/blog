import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";
import {
  pageRegistry,
  pageRoutes,
  type PageRegistration,
  type PageRoute,
} from "../pages.registry.ts";

export const generatedPagesDirectory = ".generated/pages";
export const pageRoutesManifest = "page-routes.json";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderPageHtml(page: PageRegistration): string {
  const description = page.description
    ? `\n    <meta name="description" content="${escapeHtml(page.description)}" />`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f4f1ea" />${description}
    <title>${escapeHtml(page.title)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${escapeHtml(page.entry)}"></script>
  </body>
</html>
`;
}

export function generatedPagePath(
  root: string,
  page: PageRegistration,
): string {
  return resolve(root, generatedPagesDirectory, page.outputPath);
}

export function generatePageInputs(
  root: string,
  registrations: readonly PageRegistration[] = pageRegistry,
): Record<string, string> {
  const generatedRoot = resolve(root, generatedPagesDirectory);
  rmSync(generatedRoot, { recursive: true, force: true });

  const inputs: Record<string, string> = {};
  for (const page of registrations) {
    const filename = generatedPagePath(root, page);
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, renderPageHtml(page));
    inputs[page.id] = filename;
  }
  return inputs;
}

export function pageRouteMap(
  registrations: readonly PageRegistration[] = pageRegistry,
): ReadonlyMap<string, string> {
  return new Map(
    pageRoutes(registrations).map((route) => [
      route.alias,
      `/${generatedPagesDirectory}/${route.outputPath}`,
    ]),
  );
}

export function serializePageRoutes(routes: readonly PageRoute[]): string {
  return `${JSON.stringify(routes, undefined, 2)}\n`;
}

export function pageTemplatePlugin(
  registrations: readonly PageRegistration[] = pageRegistry,
): Plugin {
  let outputDirectory: string | undefined;
  return {
    name: "page-template",
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: pageRoutesManifest,
        source: serializePageRoutes(pageRoutes(registrations)),
      });
    },
    writeBundle() {
      if (!outputDirectory) {
        throw new Error("Page template output directory was not configured");
      }
      for (const page of registrations) {
        const generated = resolve(
          outputDirectory,
          generatedPagesDirectory,
          page.outputPath,
        );
        if (!existsSync(generated)) {
          throw new Error(`Generated page output is missing: ${page.outputPath}`);
        }
        const destination = resolve(outputDirectory, page.outputPath);
        mkdirSync(dirname(destination), { recursive: true });
        renameSync(generated, destination);
      }
      rmSync(resolve(outputDirectory, ".generated"), {
        recursive: true,
        force: true,
      });
    },
  };
}
