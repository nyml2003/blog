import { resolve } from "node:path";
import type { ScaffoldSpec } from "@fluvient-loom/page-build-kit";
import { scaffoldNewPage } from "./host.ts";

// CLI 入口：pnpm -C src/frontend run page:new -- --platform mobile --id mobile-x --title 标题 --alias /m/x
// ops page new 包装本命令。写入前先过注册表校验器，违例不落任何文件。
function argValue(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const inline = argv.find((argument) => argument.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < argv.length) return argv[index + 1];
  return undefined;
}

const platform = argValue("platform");
const id = argValue("id");
const title = argValue("title");
const alias = argValue("alias");

const invalid =
  (platform !== "mobile" && platform !== "desktop") ||
  id === undefined ||
  id === "" ||
  title === undefined ||
  title === "" ||
  alias === undefined ||
  alias === "";
if (invalid) {
  const missing: string[] = [];
  if (platform !== "mobile" && platform !== "desktop")
    missing.push("platform(mobile|desktop)");
  if (id === undefined || id === "") missing.push("id");
  if (title === undefined || title === "") missing.push("title");
  if (alias === undefined || alias === "") missing.push("alias");
  console.error(
    `用法：pnpm page:new -- --platform <mobile|desktop> --id <id> --title <标题> --alias <路径>；缺少或非法参数：${missing.join(", ")}`,
  );
  process.exit(1);
}

const spec: ScaffoldSpec = { platform, id, title, alias };
const root = resolve(import.meta.dirname, "..");
const outcome = scaffoldNewPage(spec, root);

if (outcome.issues.length > 0) {
  console.error(`页面脚手架未执行（${outcome.issues.length} 项问题）：`);
  for (const issue of outcome.issues) console.error(`  ${issue}`);
  process.exit(1);
}

console.log("页面脚手架完成，已写入：");
for (const path of outcome.written) console.log(`  ${path}`);
console.log(
  "下一步：pnpm -C src/frontend run test:frontend 确认全绿，然后开始写页面。",
);
