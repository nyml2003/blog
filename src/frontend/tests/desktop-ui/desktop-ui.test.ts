import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build, createServer, type ViteDevServer } from "vite";
import solidPlugin from "vite-plugin-solid";

type RenderFixtures = {
  renderActionLink: () => string;
  renderErrorMessage: () => string;
  renderField: () => string;
  renderLoadingButton: () => string;
  renderLoadingMessage: () => string;
};

const frontendRoot = fileURLToPath(new URL("../..", import.meta.url));
const desktopUiRoot = new URL("../../desktop-ui/", import.meta.url);
let server: ViteDevServer;
let fixtures: RenderFixtures;

test.before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [solidPlugin({ ssr: true })],
    root: frontendRoot,
  });
  fixtures = (await server.ssrLoadModule(
    "/tests/desktop-ui/fixtures/render-fixtures.tsx",
  )) as RenderFixtures;
});

test.after(async () => {
  await server.close();
});

test("Button 和 ActionLink 保留各自的原生语义", () => {
  const loadingButton = fixtures.renderLoadingButton();
  assert.match(loadingButton, /^<button\b/);
  assert.match(loadingButton, /type="submit"/);
  assert.match(loadingButton, /disabled/);
  assert.match(loadingButton, /aria-busy="true"/);
  assert.match(loadingButton, /d-ui-button--primary/);

  const link = fixtures.renderActionLink();
  assert.match(link, /^<a\b/);
  assert.match(link, /href="\/admin\/workspace\/index.html"/);
  assert.match(link, /d-ui-action-link--secondary/);
});

test("Field 输出显式 label 关联且不接管控件", () => {
  const field = fixtures.renderField();
  assert.match(field, /class="d-ui-field"/);
  assert.match(field, /<label[^>]*for="summary"/);
  assert.match(field, /<textarea[^>]*id="summary"/);
});

test("StateMessage 映射 live region、忙碌状态和稳定样式 kind", () => {
  const error = fixtures.renderErrorMessage();
  assert.match(error, /role="alert"/);
  assert.match(error, /aria-live="assertive"/);
  assert.match(error, /d-ui-state-message--error/);

  const loading = fixtures.renderLoadingMessage();
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(loading, /aria-busy="true"/);
});

test("组件实现不跨越平台、数据、query 或页面边界", async () => {
  const productionFiles = [
    "atoms/action-link.tsx",
    "atoms/button.tsx",
    "molecules/field.tsx",
    "molecules/state-message.tsx",
  ];
  const forbiddenImport =
    /from\s+["'][^"']*(?:common\/(?:client|data)|solid\/queries|desktop\/src|mobile(?:-ui)?\/|pages\/)/;

  for (const relativePath of productionFiles) {
    const source = await readFile(new URL(relativePath, desktopUiRoot), "utf8");
    assert.doesNotMatch(source, forbiddenImport, relativePath);
    assert.doesNotMatch(source, /\bdata-[\w-]+=/, relativePath);
    assert.doesNotMatch(source, /\bstyle=/, relativePath);
  }
});

test("组件 CSS 只拥有 d-ui 根，不修改现有 Desktop selector", async () => {
  const styles = await Promise.all(
    ["styles/atoms.css", "styles/molecules.css"].map((relativePath) =>
      readFile(new URL(relativePath, desktopUiRoot), "utf8"),
    ),
  );
  const source = styles.join("\n");
  assert.match(source, /\.d-ui-button/);
  assert.match(source, /\.d-ui-field/);
  assert.match(source, /\.d-ui-state-message/);
  assert.doesNotMatch(
    source,
    /(^|\n)\s*\.(?:button|field|state|error|notice)\b/,
  );
});

test("内部 showcase 可独立编译为浏览器 bundle", async () => {
  await build({
    build: {
      write: false,
    },
    configFile: fileURLToPath(
      new URL("./showcase/vite.config.ts", import.meta.url),
    ),
    logLevel: "silent",
  });
});
