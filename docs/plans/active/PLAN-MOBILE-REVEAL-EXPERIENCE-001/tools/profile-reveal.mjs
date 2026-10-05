// 逐帧剖析 mobile-detail 加载：骨架 → ? → 内容各阶段的时间线与画面。
// 依赖：integration 栈（含全部前端构建产物）。
import { chromium } from "/Users/ventus/monorepo/blog/src/frontend/node_modules/playwright-core/index.mjs";

const EXE = "/Applications/Chromium.app/Contents/MacOS/Chromium";
const ORIGIN = process.argv[2] ?? "http://127.0.0.1:18133";
const ID = process.argv[3] ?? "13";
const out = "/tmp/reveal-frames";
import { mkdirSync } from "node:fs";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
// 6x CPU 节流 + Slow 4G 量级网络，模拟真实手机体感
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 150,
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
});

await page.addInitScript(() => {
  window.__t = (label) => {
    (window.__timeline ??= []).push({ label, t: performance.now() });
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__t(`paint:${e.name}`);
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__t(`lcp:${e.element?.tagName ?? "?"}:${Math.round(e.startTime)}`);
  }).observe({ type: "largest-contentful-paint", buffered: true });
  const obs = new MutationObserver(() => {
    const shell = document.querySelector('[data-loom-app-shell="true"]');
    if (!shell && !window.__shellGone) { window.__shellGone = true; window.__t("shell-removed"); }
    const tag = document.querySelector(".m-atom-tag");
    if (tag && !window.__tagSeen) { window.__tagSeen = true; window.__t("tag-in-dom"); }
    const body = document.querySelector(".article-body");
    if (body?.children.length && !window.__bodySeen) { window.__bodySeen = true; window.__t("article-in-dom"); }
  });
  document.addEventListener("DOMContentLoaded", () => {
    window.__t("domcontentloaded");
    obs.observe(document, { childList: true, subtree: true });
  });
});

const shots = [];
const shooter = setInterval(async () => {
  const t = await page.evaluate(() => performance.now()).catch(() => -1);
  if (t >= 0) shots.push(t);
  await page.screenshot({ path: `${out}/f${String(shots.length).padStart(2, "0")}-${Math.round(t)}ms.png` }).catch(() => {});
}, 160);

await page.goto(`${ORIGIN}/m/articles/detail.html?id=${ID}`, { waitUntil: "load" }).catch(() => {});
await page.waitForTimeout(6000);
clearInterval(shooter);

const timeline = await page.evaluate(() => ({
  timeline: window.__timeline ?? [],
  tagInfo: (() => {
    const tag = document.querySelector(".m-atom-tag");
    if (!tag) return null;
    const r = tag.getBoundingClientRect();
    return { text: tag.textContent, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  })(),
  tagCount: document.querySelectorAll(".m-atom-tag").length,
}));
console.log("TIMELINE:", JSON.stringify(timeline.timeline, null, 1));
console.log("TAG:", JSON.stringify(timeline.tagInfo), "count:", timeline.tagCount);
console.log(`FRAMES: ${shots.length} shots at ~160ms -> ${out}/`);
await browser.close();
