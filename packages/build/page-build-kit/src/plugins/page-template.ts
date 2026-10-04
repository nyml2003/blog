import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { renderAppShell } from "@fluvient-loom/app-shell";
import type { Plugin } from "vite";
import { pageRoutes, type PageRegistration } from "../types.ts";
import { h } from "./jsx-html.ts";

export const generatedPagesDirectory = ".generated/pages";
export const pageRoutesManifest = "page-routes.json";

/** 平台统一入口：所有页面共享同一 main.tsx，data-page-id 区分页面。 */
export function platformEntry(platform: string): string {
  return platform === "desktop"
    ? "/bootstrap/desktop/main.tsx"
    : "/bootstrap/mobile/main.tsx";
}

export function renderPageHtml(page: PageRegistration): string {
  const shell =
    page.shell === undefined ? undefined : renderAppShell(page.shell);

  const head = h("head", null,
    h("meta", { charset: "UTF-8" }),
    h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
    h("meta", { name: "theme-color", content: "#f4f1ea" }),
    page.description ? h("meta", { name: "description", content: page.description }) : null,
    h("title", null, page.title),
  );

  const body = h("body", null,
    shell ? h("style", { "data-loom-app-shell": true, dangerouslySetInnerHTML: shell.criticalCss }) : null,
    shell ? h("div", { "data-loom-app-shell": "true", "aria-hidden": "true", dangerouslySetInnerHTML: shell.html }) : null,
    h("div", { id: "app" }),
    h("script", { type: "module", src: platformEntry(page.platform) }),
  );

  return `<!doctype html>\n<html lang="zh-CN" data-page-id="${page.id}">\n  ${head.html}\n  ${body.html}\n</html>\n`;
}

export function generatedPagePath(
  root: string,
  page: PageRegistration,
): string {
  return resolve(root, generatedPagesDirectory, page.outputPath);
}

export function generatePageInputs(
  root: string,
  registrations: readonly PageRegistration[],
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
  registrations: readonly PageRegistration[],
): ReadonlyMap<string, string> {
  return new Map(
    pageRoutes(registrations).map((route) => [
      route.alias,
      `/${generatedPagesDirectory}/${route.outputPath}`,
    ]),
  );
}

export function serializePageRoutes(
  routes: readonly ReturnType<typeof pageRoutes>[number][],
): string {
  return `${JSON.stringify(routes, undefined, 2)}\n`;
}

export function pageTemplatePlugin(
  registrations: readonly PageRegistration[],
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
          throw new Error(
            `Generated page output is missing: ${page.outputPath}`,
          );
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
