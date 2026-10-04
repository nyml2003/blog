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
  /**
   * 内联引导脚本的构建入口（宿主提供，如 "bootstrap/mobile-settings.tsx"）。
   * 该入口经 configFile:false 的独立构建打包（无宿主框架插件，JSX 不可用）：
   * 其静态 import 图必须保持纯 TS——不得触达页面包根的登记（definition.load
   * 的动态 import 目标 page.tsx 需要 JSX 转换；引导入口要取页面模型时走
   * 页面包的模型子路径）。
   */
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
      // 内联进每张 HTML：<head> 里逐字节都算成本，去注释/空白后再注入。
      minify: true,
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
