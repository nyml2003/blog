import { resolve } from "node:path";
import { build, type HtmlTagDescriptor, type Plugin } from "vite";
import {
  pageRegistry,
  type PageRegistration,
} from "../pages.registry.ts";
import { generatedPagePath } from "./page-template.ts";

type BootstrapBundler = (root: string) => Promise<string>;

interface PageBootstrapDependencies {
  bundle: BootstrapBundler;
}

async function bundleBootstrap(root: string): Promise<string> {
  const result = await build({
    configFile: false,
    root,
    logLevel: "silent",
    publicDir: false,
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      target: "es2020",
      lib: {
        entry: resolve(root, "mobile/src/logic/settings-bootstrap.ts"),
        name: "PageBootstrap",
        formats: ["iife"],
      },
    },
  });

  const bundles = Array.isArray(result) ? result : [result];
  for (const bundle of bundles) {
    if (!("output" in bundle)) {
      await bundle.close();
      throw new Error("Page bootstrap must produce a single build output");
    }
    for (const output of bundle.output) {
      if (output.type === "chunk" && output.isEntry) {
        return output.code;
      }
    }
  }
  throw new Error("Page bootstrap entry was not emitted");
}

export function pageBootstrap(
  root: string,
  registrations: readonly PageRegistration[] = pageRegistry,
  dependencies: PageBootstrapDependencies = { bundle: bundleBootstrap },
) {
  const bootstrapPages = new Set(
    registrations
      .filter((page) => page.bootstrap)
      .map((page) => generatedPagePath(root, page)),
  );
  let bundledSource: Promise<string> | undefined;

  function source(): Promise<string> {
    bundledSource ??= dependencies.bundle(root);
    return bundledSource;
  }

  return {
    name: "page-bootstrap",
    transformIndexHtml: {
      order: "post",
      async handler(
        _html: string,
        context: { filename: string; path: string },
      ): Promise<HtmlTagDescriptor[] | undefined> {
        if (!bootstrapPages.has(context.filename)) {
          return undefined;
        }
        const bootstrapSource = await source();
        return [
          {
            tag: "script",
            children: bootstrapSource.replace(/<\/script/gi, "<\\/script"),
            injectTo: "head",
          },
        ];
      },
    },
  } satisfies Plugin;
}
