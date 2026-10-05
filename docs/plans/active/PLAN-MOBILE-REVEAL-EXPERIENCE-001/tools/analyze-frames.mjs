// 逐帧像素统计：把 filmstrip 每帧按颜色族分类，量化“骨架/空白/线/内容/tag”各阶段。
import { chromium } from "/Users/ventus/monorepo/blog/src/frontend/node_modules/playwright-core/index.mjs";
import { readdirSync, readFileSync } from "node:fs";

const EXE = "/Applications/Chromium.app/Contents/MacOS/Chromium";
const dir = process.argv[2] ?? "/tmp/reveal-frames";
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 400, height: 100 } });
await page.goto("about:blank");

const results = [];
for (const file of files) {
  const b64 = readFileSync(`${dir}/${file}`).toString("base64");
  const stats = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const w = 200; // downscale for speed
    const h = Math.round((img.height / img.width) * w);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let skeleton = 0, dark = 0, coral = 0, paper = 0, other = 0, total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      total++;
      // paper #f4f1ea 及近似
      if (r > 235 && g > 230 && b > 215 && r - b < 30) { paper++; continue; }
      // 骨架灰：低饱和中性灰（#e2e4e8 混 paper 后 ≈ 浅冷灰）
      if (b > r && b - r >= 2 && r > 200 && r < 235) { skeleton++; continue; }
      // tag 珊瑚：偏红橙
      if (r - g > 40 && r - b > 40) { coral++; continue; }
      // 深色文字
      if (r < 130 && g < 130 && b < 130) { dark++; continue; }
      other++;
    }
    return {
      skeleton: +(100 * skeleton / total).toFixed(2),
      dark: +(100 * dark / total).toFixed(2),
      coral: +(100 * coral / total).toFixed(2),
      paper: +(100 * paper / total).toFixed(2),
      other: +(100 * other / total).toFixed(2),
    };
  }, `data:image/png;base64,${b64}`);
  results.push({ file, ...stats });
}
await browser.close();

console.log("file              | paper | skeleton | dark(text) | coral(tag) | other");
for (const r of results) {
  console.log(
    `${r.file.padEnd(18)} | ${String(r.paper).padStart(5)} | ${String(r.skeleton).padStart(7)} | ${String(r.dark).padStart(10)} | ${String(r.coral).padStart(10)} | ${String(r.other).padStart(5)}`,
  );
}
