import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { DEFAULT_SERVED_PATH } from "../src/constants.ts";
import {
  mobilePrefetchServiceWorker,
  serviceWorkerEntrySource,
} from "../src/vite.ts";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

interface EmittedFile {
  readonly type: string;
  readonly fileName: string;
  readonly source: string;
}

function emitCollector() {
  const emitted: EmittedFile[] = [];
  return {
    emitted,
    context: {
      emitFile(file: EmittedFile) {
        emitted.push(file);
      },
    },
  };
}

test("DEFAULT_SERVED_PATH matches the backend hardcoded asset path", () => {
  // 哨兵：src/backend/product/src/static_files.rs 硬编码同一路径，单侧改动会在此红。
  assert.equal(DEFAULT_SERVED_PATH, "/mobile-prefetch-sw.js");
});

test("serviceWorkerEntrySource wires attachMobilePrefetch with an escaped prefix", () => {
  const source = serviceWorkerEntrySource('/api/x"quote');
  assert.ok(
    source.includes(
      'import { attachMobilePrefetch } from "@fluvient-loom/mobile-prefetch/service-worker";',
    ),
  );
  assert.ok(
    source.includes(
      'attachMobilePrefetch(self, { apiPathPrefix: "/api/x\\"quote" });',
    ),
  );
});

test("plugin bundles once, serves in dev, and emits the wired asset", async () => {
  let bundleCalls = 0;
  const plugin = mobilePrefetchServiceWorker(packageRoot, {
    apiPathPrefix: "/api/public/mobile/category-shelf",
    dependencies: {
      bundle: async (root, source, fileName) => {
        bundleCalls += 1;
        assert.equal(root, packageRoot);
        assert.equal(fileName, "mobile-prefetch-sw.js");
        assert.ok(source.includes("/api/public/mobile/category-shelf"));
        return "/*bundled*/";
      },
    },
  });

  let middleware:
    | ((
        request: { url?: string },
        response: {
          statusCode: number;
          setHeader(name: string, value: string): void;
          end(body: string): void;
        },
        next: () => void,
      ) => Promise<void>)
    | undefined;
  (
    plugin.configureServer as (server: {
      middlewares: {
        use(
          handler: typeof middleware extends undefined
            ? never
            : NonNullable<typeof middleware>,
        ): void;
      };
    }) => void
  )({
    middlewares: {
      use(handler) {
        middleware = handler as typeof middleware;
      },
    },
  });
  assert.ok(middleware);

  const headers: Record<string, string> = {};
  let body = "";
  let nextCalls = 0;
  await middleware(
    { url: "/other.js?x=1" },
    {
      statusCode: 0,
      setHeader(name, value) {
        headers[name] = value;
      },
      end(value) {
        body = value;
      },
    },
    () => {
      nextCalls += 1;
    },
  );
  assert.equal(nextCalls, 1);
  assert.equal(bundleCalls, 0);

  await middleware(
    { url: "/mobile-prefetch-sw.js?cache=1" },
    {
      statusCode: 0,
      setHeader(name, value) {
        headers[name] = value;
      },
      end(value) {
        body = value;
      },
    },
    () => {
      nextCalls += 1;
    },
  );
  assert.equal(body, "/*bundled*/");
  assert.equal(
    headers["Content-Type"],
    "application/javascript; charset=utf-8",
  );
  assert.equal(headers["Cache-Control"], "no-cache");

  const collector = emitCollector();
  const generateBundle = plugin.generateBundle as (
    this: typeof collector.context,
  ) => Promise<void>;
  await generateBundle.call(collector.context);
  assert.equal(bundleCalls, 1);
  assert.deepEqual(collector.emitted, [
    { type: "asset", fileName: "mobile-prefetch-sw.js", source: "/*bundled*/" },
  ]);
});

test("real nested build produces the fully wired service worker", async () => {
  const plugin = mobilePrefetchServiceWorker(packageRoot, {
    apiPathPrefix: "/api/public/mobile/category-shelf",
  });
  const collector = emitCollector();
  const generateBundle = plugin.generateBundle as (
    this: typeof collector.context,
  ) => Promise<void>;
  await generateBundle.call(collector.context);
  assert.equal(collector.emitted.length, 1);
  const output = collector.emitted[0].source;
  // 应用配置字面量
  assert.ok(output.includes("/api/public/mobile/category-shelf"));
  // 运行时协议常量（压缩后仍在，证明真打包而非源码搬运）
  assert.ok(output.includes("mobile-prefetch/prefetch"));
  assert.ok(output.includes("mobile-prefetch-v1"));
  assert.ok(output.includes("x-mobile-prefetch-stored-at"));
  // SW 全局接线（属性访问不被压缩改名）
  assert.ok(output.includes("skipWaiting"));
  assert.ok(output.includes("respondWith"));
  assert.notEqual(
    output,
    serviceWorkerEntrySource("/api/public/mobile/category-shelf"),
  );
});
