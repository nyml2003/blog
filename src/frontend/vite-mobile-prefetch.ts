import { build, type Plugin } from "vite";
import { resolve } from "node:path";

async function bundleServiceWorker(root: string): Promise<string> {
  const result = await build({
    configFile: false,
    root,
    logLevel: "silent",
    publicDir: false,
    build: {
      write: false,
      emptyOutDir: false,
      minify: true,
      target: "es2020",
      lib: {
        entry: resolve(root, "mobile-prefetch-sw.ts"),
        name: "MobilePrefetchServiceWorker",
        formats: ["iife"],
        fileName: () => "mobile-prefetch-sw.js",
      },
    },
  });
  const bundles = Array.isArray(result) ? result : [result];
  for (const bundle of bundles) {
    if (!("output" in bundle)) {
      await bundle.close();
      throw new Error("Mobile prefetch service worker must produce a bundle");
    }
    for (const output of bundle.output) {
      if (output.type === "chunk" && output.isEntry) return output.code;
    }
  }
  throw new Error("Mobile prefetch service worker entry was not emitted");
}

export function mobilePrefetchServiceWorker(root: string): Plugin {
  let source: Promise<string> | undefined;
  return {
    name: "mobile-prefetch-service-worker",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?", 1)[0] !== "/mobile-prefetch-sw.js") {
          next();
          return;
        }
        source ??= bundleServiceWorker(root);
        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          "application/javascript; charset=utf-8",
        );
        response.setHeader("Cache-Control", "no-cache");
        response.end(await source);
      });
    },
    async generateBundle() {
      source ??= bundleServiceWorker(root);
      this.emitFile({
        type: "asset",
        fileName: "mobile-prefetch-sw.js",
        source: await source,
      });
    },
  };
}
