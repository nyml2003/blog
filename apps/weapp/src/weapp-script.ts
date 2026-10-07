import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type ReleaseAsset = { readonly name: string; readonly browser_download_url: string };
type Release = { readonly tag_name: string; readonly draft?: boolean; readonly prerelease?: boolean; readonly assets: readonly ReleaseAsset[] };

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value !== undefined) args.set(key.slice(2), value);
}

const repo = args.get("repo") ?? "nyml2003/blog";
const version = args.get("version");
const environment = args.get("environment") ?? "test";
if (environment !== "test" && environment !== "production") fail("--environment must be test or production");
const destination = resolve(args.get("out") ?? "weapp");
const api = `https://api.github.com/repos/${repo}/releases?per_page=100`;

function fail(message: string): never {
  console.error(`weapp-script: ${message}`);
  process.exit(1);
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { "user-agent": "blog-weapp-script", accept: "application/vnd.github+json" } });
  if (!response.ok) fail(`下载失败 ${response.status}: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

const releases = await fetch(api).then(async (response) => {
  if (!response.ok) fail(`Release API 失败 ${response.status}`);
  return await response.json() as Release[];
});
const candidates = releases
  .filter((release) => !release.draft && !release.prerelease && new RegExp(`^weapp${environment === "test" ? "-test" : ""}-v\\d+\\.\\d+\\.\\d+$`).test(release.tag_name))
  .filter((release) => version === undefined || release.tag_name === `weapp${environment === "test" ? "-test" : ""}-v${version}`)
  .sort((left, right) => right.tag_name.localeCompare(left.tag_name, undefined, { numeric: true }));
const release = candidates[0];
if (!release) fail(version === undefined ? `没有可用的 ${environment} weapp Release` : `找不到 ${environment} weapp 版本 ${version}`);
const archive = release.assets.find((asset) => asset.name === `blog-weapp-${environment}-${release.tag_name.split("-v")[1]}.tar.gz`);
const checksum = release.assets.find((asset) => asset.name === `${archive?.name}.sha256`);
if (!archive || !checksum) fail(`Release ${release.tag_name} 缺少小程序包或校验和`);

const temporary = resolve(process.cwd(), `.weapp-${Date.now()}.tar.gz`);
try {
  const bytes = await fetchBytes(archive.browser_download_url);
  const expected = (await fetchBytes(checksum.browser_download_url)).toString().trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) fail(`校验和不匹配: expected ${expected}, got ${actual}`);
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const extracted = spawnSync("tar", ["-xzf", temporary, "-C", destination], { encoding: "utf8" });
  if (extracted.status !== 0) fail(`解压失败: ${extracted.stderr.trim()}`);
  console.log(`已下载 ${release.tag_name} 到 ${join(destination, "weapp")}`);
} finally {
  await rm(temporary, { force: true });
}
