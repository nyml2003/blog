import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite";
import { DEFAULT_SERVED_PATH } from "./constants.ts";

// Vite 集成（闭环的一部分）：SW 入口由本插件从 apiPathPrefix 生成（虚拟模块），
// 打成 IIFE——dev 中间件按需伺服、build 期作为 asset 发出。应用不写入口文件。
//
// 虚拟入口的关键实现约束（Vite 8 源码级验证）：
// - build.lib.entry 会被 path.resolve(root, entry) 拼坏虚拟 id，必须走
//   build.rolldownOptions.input（原样透传、优先于 lib.entry；lib.entry 仅留
//   非空占位满足校验）。
// - 入口插件必须每次 build 新建、且绝不能是本插件实例（会造成嵌套 emitFile 递归）。

const VIRTUAL_ENTRY_ID = "\0mobile-prefetch-sw-entry";

/** SW 入口源码：应用不写入口文件，配置即入口。 */
export function serviceWorkerEntrySource(apiPathPrefix: string): string {
  return [
    'import { attachMobilePrefetch } from "@fluvient-loom/mobile-prefetch/service-worker";',
    "",
    `attachMobilePrefetch(self, { apiPathPrefix: ${JSON.stringify(apiPathPrefix)} });`,
    "",
  ].join("\n");
}

function virtualEntryPlugin(source: string): Plugin {
  return {
    name: "mobile-prefetch-sw-entry",
    enforce: "pre",
    resolveId(id) {
      return id === VIRTUAL_ENTRY_ID ? VIRTUAL_ENTRY_ID : undefined;
    },
    load(id) {
      return id === VIRTUAL_ENTRY_ID ? source : undefined;
    },
  };
}

type MobilePrefetchBundle = (
  root: string,
  source: string,
  fileName: string,
) => Promise<string>;

async function bundleServiceWorker(
  root: string,
  source: string,
  fileName: string,
): Promise<string> {
  // 嵌套 alias：SW 产物永远用本插件同包的 service-worker 运行时源码，
  // 不依赖宿主的 node_modules 解析或同包多副本（root 因此可任取）。
  const serviceWorkerModule = fileURLToPath(
    new URL("./service-worker.ts", import.meta.url),
  );
  const result = await build({
    configFile: false,
    root,
    logLevel: "silent",
    publicDir: false,
    plugins: [virtualEntryPlugin(source)],
    resolve: {
      alias: [
        {
          find: "@fluvient-loom/mobile-prefetch/service-worker",
          replacement: serviceWorkerModule,
        },
      ],
    },
    build: {
      write: false,
      emptyOutDir: false,
      minify: true,
      target: "es2020",
      lib: {
        // 占位：实际入口由下方 rolldownOptions.input 原样透传（见文件头约束）。
        entry: VIRTUAL_ENTRY_ID,
        name: "MobilePrefetchServiceWorker",
        formats: ["iife"],
        fileName: () => fileName,
      },
      rolldownOptions: {
        input: VIRTUAL_ENTRY_ID,
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

export interface MobilePrefetchPluginOptions {
  /** SW 运行时允许缓存的 API 前缀（应用 API 契约，如 "/api/public/mobile/category-shelf"）。 */
  readonly apiPathPrefix: string;
  /** 伺服/产出的路径与文件名，默认 "/mobile-prefetch-sw.js"。 */
  readonly servedPath?: string;
  /** 测试注入点（page-bootstrap 同款先例）。 */
  readonly dependencies?: { readonly bundle?: MobilePrefetchBundle };
}

export function mobilePrefetchServiceWorker(
  root: string,
  options: MobilePrefetchPluginOptions,
): Plugin {
  const servedPath = options.servedPath ?? DEFAULT_SERVED_PATH;
  const fileName = servedPath.replace(/^\//, "");
  const bundle = options.dependencies?.bundle ?? bundleServiceWorker;
  let source: Promise<string> | undefined;

  function bundledSource(): Promise<string> {
    source ??= bundle(
      root,
      serviceWorkerEntrySource(options.apiPathPrefix),
      fileName,
    );
    return source;
  }

  return {
    name: "mobile-prefetch-service-worker",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?", 1)[0] !== servedPath) {
          next();
          return;
        }
        const code = await bundledSource();
        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          "application/javascript; charset=utf-8",
        );
        response.setHeader("Cache-Control", "no-cache");
        response.end(code);
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName,
        source: await bundledSource(),
      });
    },
  };
}
