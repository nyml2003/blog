import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

test("production pages load the shared CommonJS runtime", () => {
  const pages = [];
  // WeChat loads .js as CommonJS independently of the workspace's ESM package.json.
  const context = createContext({ Page: (page) => pages.push(page), setTimeout, clearTimeout });
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const execute = runInContext(`(function(require, module, exports) { ${readFileSync(file, "utf8")}\n})`, context, { filename: file });
    execute((specifier) => load(resolve(dirname(file), specifier)), module, module.exports);
    return module.exports;
  };
  const root = fileURLToPath(new URL("../../../target/weapp/", import.meta.url));
  for (const name of ["home", "articles", "detail", "settings"]) {
    load(resolve(root, `pages/${name}/${name}.js`));
  }
  assert.equal(pages.length, 4);
  assert.ok(pages.every((page) => typeof page.onLoad === "function"));
  assert.equal(cache.size, 5);
});
