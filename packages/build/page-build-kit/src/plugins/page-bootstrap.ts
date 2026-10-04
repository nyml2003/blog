import { resolve } from "node:path";
import { build, type HtmlTagDescriptor, type Plugin } from "vite";
import { generatedPagePath } from "./page-template.ts";
import type { PageRegistration } from "../types.ts";

type BootstrapBundler = (root: string, entry: string) => Promise<string>;

export interface PageBootstrapDependencies {
  readonly bundle: BootstrapBundler;
}

export interface PageBootstrapOptions {
  /** 参与 HTML 生成的页面登记（宿主注册表）。 */
  readonly registrations: readonly PageRegistration[];
  /** 内联引导脚本的构建入口（宿主提供，如 "bootstrap/mobile-settings.tsx"）。 */
  readonly bootstrapEntry: string;
  readonly dependencies?: PageBootstrapDependencies;
}

async function bundleBootstrap(root: string, entry: string): Promise<string> {
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
        entry: resolve(root, entry),
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
  options: PageBootstrapOptions,
): Plugin {
  const { registrations, bootstrapEntry } = options;
  const bundle = options.dependencies?.bundle ?? bundleBootstrap;
  const bootstrapPages = new Set(
    registrations
      .filter((page) => page.bootstrap)
      .map((page) => generatedPagePath(root, page)),
  );
  let bundledSource: Promise<string> | undefined;

  function source(): Promise<string> {
    if (!bundledSource) {
      bundledSource = bundle(root, bootstrapEntry);
    }
    return bundledSource;
  }

  // 独立箭头函数而非方法简写：不携带 this 类型，宿主测试可无绑定调用。
  const handler = async (
    _html: string,
    context: { filename: string; path: string },
  ): Promise<HtmlTagDescriptor[] | undefined> => {
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
  };

  return {
    name: "page-bootstrap",
    transformIndexHtml: { order: "post", handler },
  } satisfies Plugin;
}
