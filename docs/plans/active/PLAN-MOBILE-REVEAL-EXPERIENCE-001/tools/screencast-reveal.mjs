// 用 CDP screencast 抓揭幕前后每个合成器帧，逐帧像素分类。
import { chromium } from "/Users/ventus/monorepo/blog/src/frontend/node_modules/playwright-core/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const EXE = "/Applications/Chromium.app/Contents/MacOS/Chromium";
const ORIGIN = process.argv[2] ?? "http://127.0.0.1:18133";
const ID = process.argv[3] ?? "13";
const out = "/tmp/reveal-cast";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false, latency: 150,
  downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8,
});

const frames = [];
cdp.on("Page.screencastFrame", (ev) => {
  frames.push({ t: performance.now(), ts: ev.metadata.timestamp ?? 0, data: ev.data });
  void cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
});
await cdp.send("Page.enable");
await cdp.send("Page.startScreencast", { format: "png", everyFrame: true });

await page.addInitScript(() => {
  (window.__marks ??= []).push;
  window.__t = (label) => (window.__timeline ??= []).push({ label, t: performance.now() });
  new MutationObserver(() => {
    const shell = document.querySelector('[data-loom-app-shell="true"]');
    if (!shell && !window.__shellGone) { window.__shellGone = true; window.__t("shell-removed"); }
    if (document.querySelector(".m-atom-tag") && !window.__tagSeen) { window.__tagSeen = true; window.__t("tag-in-dom"); }
    if (document.querySelector(".article-body")?.children.length && !window.__bodySeen) { window.__bodySeen = true; window.__t("article-in-dom"); }
  }).observe(document, { childList: true, subtree: true });
});

await page.goto(`${ORIGIN}/m/articles/detail.html?id=${ID}`, { waitUntil: "load" }).catch(() => {});
await page.waitForTimeout(4000);
await cdp.send("Page.stopScreencast").catch(() => {});

// 按时间排序并去重（screencast 只在画面变化时发帧）
frames.sort((a, b) => a.t - b.t);
const seen = new Set();
const unique = frames.filter((f) => {
  const key = f.data.slice(0, 64);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
unique.forEach((f, i) => writeFileSync(`${out}/c${String(i).padStart(3, "0")}-${Math.round(f.t)}ms.png`, Buffer.from(f.data, "base64")));

const timeline = await page.evaluate(() => window.__timeline ?? []);
console.log("TIMELINE:", JSON.stringify(timeline));
console.log(`CAST: ${frames.length} frames, ${unique.length} unique -> ${out}/`);
await browser.close();
