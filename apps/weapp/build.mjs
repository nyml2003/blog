import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname);
const out = resolve(root, "../../target/weapp");
const check = process.argv.includes("--check");
const required = ["app.json", "app.ts", "app.wxss", "pages/home/home.wxml", "pages/articles/articles.wxml", "pages/detail/detail.wxml", "pages/settings/settings.wxml"];
for (const file of required) {
  try { await readFile(join(root, file)); } catch { console.error(`weapp missing ${file}`); process.exitCode = 1; }
}
if (!check && !process.exitCode) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(root, out, { recursive: true, filter: (source) => !source.includes("/node_modules/") && !source.endsWith("/node_modules") && !source.includes("/test/") && !source.endsWith("/test") && !source.endsWith("/build.mjs") && !source.endsWith("/package.json") && !source.includes("/src/") && !source.endsWith("/src") && !source.endsWith(".ts") && !source.endsWith(".d.ts") && !source.endsWith("/tsconfig.json") });
  const apiOrigin = process.env.BLOG_WEAPP_API_ORIGIN ?? "http://127.0.0.1:8080";
  await build({
    entryPoints: [join(root, "app.ts")],
    bundle: false,
    platform: "browser",
    format: "iife",
      outfile: join(out, "app.js"),
      define: { "__BLOG_WEAPP_API_ORIGIN__": JSON.stringify(apiOrigin) },
      minify: true,
  });
  await build({
    entryPoints: [join(root, "src/runtime.ts")],
    bundle: true,
    platform: "browser",
    format: "cjs",
    outfile: join(out, "lib/runtime.js"),
    legalComments: "none",
    minify: true,
  });
  for (const page of ["home/home", "articles/articles", "detail/detail", "settings/settings"]) {
    await build({
      entryPoints: [join(root, "pages", `${page}.ts`)],
      bundle: true,
      platform: "browser",
      format: "cjs",
      plugins: [{
        name: "shared-weapp-runtime",
        setup(builder) {
          builder.onResolve({ filter: /\/src\/runtime\.ts$/ }, () => ({
            path: "../../lib/runtime.js",
            external: true,
          }));
        },
      }],
      outfile: join(out, "pages", `${page}.js`),
      legalComments: "none",
      minify: true,
    });
  }
  const testOut = resolve(root, "../../target/weapp-test/lib");
  await rm(resolve(root, "../../target/weapp-test"), { recursive: true, force: true });
  await mkdir(testOut, { recursive: true });
  await build({
    entryPoints: [join(root, "src/api.ts"), join(root, "src/rich-text.ts"), join(root, "src/article-list.ts"), join(root, "src/resource.ts")],
    bundle: true,
    platform: "browser",
    format: "cjs",
    outdir: testOut,
    entryNames: "[name]",
    outExtension: { ".js": ".cjs" },
    legalComments: "none",
    minify: true,
  });
  async function packageBytes(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const path = join(directory, entry.name);
      total += entry.isDirectory() ? await packageBytes(path) : (await readFile(path)).byteLength;
    }
    return total;
  }
  const bundleSize = await packageBytes(out);
  if (bundleSize > 2 * 1024 * 1024) {
    console.error(`weapp main bundle exceeds 2 MiB: ${bundleSize}`);
    process.exitCode = 1;
  }
  await writeFile(join(out, "README.txt"), `Open this directory in微信开发者工具. API origin: ${apiOrigin}. Configure request domains or use a local proxy.\n`);
  console.log(`weapp built: ${out}`);
} else if (!process.exitCode) console.log("weapp source check passed");
