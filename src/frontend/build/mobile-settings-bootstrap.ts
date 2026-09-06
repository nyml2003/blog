import { resolve } from "node:path";
import { build, type HtmlTagDescriptor, type Plugin } from "vite";

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
        name: "MobileSettingsBootstrap",
        formats: ["iife"],
      },
    },
  });

  const bundles = Array.isArray(result) ? result : [result];
  for (const bundle of bundles) {
    if (!("output" in bundle)) {
      await bundle.close();
      throw new Error(
        "Mobile settings bootstrap must produce a single build output",
      );
    }
    for (const output of bundle.output) {
      if (output.type === "chunk" && output.isEntry) return output.code;
    }
  }
  throw new Error("Mobile settings bootstrap entry was not emitted");
}

export function mobileSettingsBootstrap(root: string) {
  const mobilePagesRoot = resolve(root, "mobile/pages");
  return {
    name: "mobile-settings-bootstrap",
    transformIndexHtml: {
      order: "post",
      async handler(
        _html: string,
        context: { filename: string; path: string },
      ): Promise<HtmlTagDescriptor[] | undefined> {
        if (
          context.filename !== mobilePagesRoot &&
          !context.filename.startsWith(`${mobilePagesRoot}/`)
        )
          return;
        const source = await bundleBootstrap(root);
        return [
          {
            tag: "script",
            children: source.replace(/<\/script/gi, "<\\/script"),
            injectTo: "head",
          },
        ];
      },
    },
  } satisfies Plugin;
}
