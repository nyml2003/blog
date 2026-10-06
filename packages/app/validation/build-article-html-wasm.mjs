import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../../../", import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: workspace, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function requiredWasmBindgenVersion() {
  const manifest = readFileSync(
    join(workspace, "src/core/article-html-wasm/Cargo.toml"),
    "utf8",
  );
  const match = /^wasm-bindgen\s*=\s*"=([^"]+)"/m.exec(manifest);
  if (match === null) {
    throw new Error(
      "src/core/article-html-wasm/Cargo.toml 未精确锁定 wasm-bindgen 版本",
    );
  }
  return match[1];
}

function wasmBindgenVersion(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  const match = /wasm-bindgen\s+(\S+)/.exec(result.stdout);
  return match === null ? null : match[1];
}

function resolveWasmBindgen(required) {
  const attempted = [];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir.length === 0) continue;
    const candidate = join(dir, "wasm-bindgen");
    if (!existsSync(candidate)) continue;
    const version = wasmBindgenVersion(candidate);
    if (version === required) return candidate;
    attempted.push(`${candidate}（${version ?? "无法执行"}）`);
  }
  throw new Error(
    [
      `找不到与 Rust crate 匹配的 wasm-bindgen ${required}。`,
      "请进入项目 Nix 开发环境（direnv allow 或 nix develop ./nix）后重试。",
      ...attempted.map((item) => `已尝试 ${item}`),
    ].join("\n"),
  );
}

const wasmBindgen = resolveWasmBindgen(requiredWasmBindgenVersion());

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
run(wasmBindgen, [
  "--target",
  "web",
  "--out-dir",
  "packages/app/validation/src/generated",
  "--out-name",
  "article_html_wasm",
  wasmInput,
]);
