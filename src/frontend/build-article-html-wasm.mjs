import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../../", import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: workspace, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("cargo", [
  "build",
  "--locked",
  "--release",
  "--manifest-path",
  "src/Cargo.toml",
  "--target",
  "wasm32-unknown-unknown",
  "-p",
  "article-html-wasm",
]);
const wasmInput =
  "src/target/wasm32-unknown-unknown/release/article_html_wasm.wasm";
run("wasm-bindgen", [
  "--target",
  "web",
  "--out-dir",
  "packages/app/validation/src/generated",
  "--out-name",
  "article_html_wasm",
  wasmInput,
]);
