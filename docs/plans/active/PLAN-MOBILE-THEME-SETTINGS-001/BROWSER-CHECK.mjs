import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = await import(process.env.BLOG_PLAYWRIGHT_MODULE);
const origin = process.argv[2];
assert.ok(origin, "Pass the local page origin");
const output = process.env.BLOG_THEME_EVIDENCE_DIR;
assert.ok(output, "Set BLOG_THEME_EVIDENCE_DIR");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BLOG_CHROMIUM_PATH,
  headless: true,
});
const results = [];
const errors = [];

function luminance(color) {
  const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number);
  const linear = channels.map((channel) => {
    const value = channel / 255;
    if (value <= 0.04045) return value / 12.92;
    return ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function legacyAppearance(page) {
  return page.evaluate(() => {
    return ["html", ".mobile-header", ".bottom-nav"].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return [selector, style.color, style.backgroundColor, style.fontFamily];
    });
  });
}

async function inspect(page) {
  return page.evaluate(() => {
    const atoms = [...document.querySelectorAll(".m-atom")].map((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        color: style.color,
        background: style.backgroundColor,
        font: style.fontFamily,
        scheme: style.colorScheme,
        width: box.width,
        height: box.height,
      };
    });
    const nav = [...document.querySelectorAll(".bottom-nav a")].map((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, top: box.top };
    });
    return {
      theme: document.documentElement.dataset.theme,
      font: document.documentElement.dataset.font,
      overflow: document.documentElement.scrollWidth > innerWidth,
      atoms,
      nav,
    };
  });
}

async function openContext(width, initialize) {
  const context = await browser.newContext({ viewport: { width, height: 812 } });
  if (initialize) await context.addInitScript(initialize);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/m/settings/index.html`);
  await page.locator("#mobile-theme").waitFor();
  return { context, page };
}

try {
  for (const width of [375, 360, 1280]) {
    const { context, page } = await openContext(width);
    const legacy = await legacyAppearance(page);
    for (const theme of ["paper", "dark", "sepia"]) {
      for (const font of ["sans", "serif", "mono"]) {
        await page.selectOption("#mobile-theme", theme);
        await page.selectOption("#mobile-font", font);
        const state = await inspect(page);
        assert.equal(state.theme, theme);
        assert.equal(state.font, font);
        assert.equal(state.overflow, false);
        assert.equal(state.atoms.length, 5);
        assert.equal(state.nav.length, 3);
        assert.equal(new Set(state.nav.map((link) => link.top)).size, 1);
        for (const link of state.nav) {
          assert.ok(link.width >= 44 && link.height >= 44);
        }
        for (const atom of state.atoms) {
          assert.ok(contrast(atom.color, atom.background) >= 4.5);
          assert.equal(atom.scheme, theme === "dark" ? "dark" : "light");
          if (atom.tag === "SELECT") assert.ok(atom.height >= 44);
        }
        assert.deepEqual(await legacyAppearance(page), legacy);
        await page.reload();
        await page.locator("#mobile-theme").waitFor();
        assert.equal(await page.locator("#mobile-theme").inputValue(), theme);
        assert.equal(await page.locator("#mobile-font").inputValue(), font);
        if (width < 400) {
          await page.screenshot({ path: `${output}/${width}-${theme}-${font}.png`, fullPage: true });
        }
        results.push({ width, theme, font, state });
      }
    }
    await context.close();
  }

  const invalid = await openContext(375, () => {
    localStorage.setItem("blog.mobile.theme", "neon");
    localStorage.setItem("blog.mobile.font", "remote");
  });
  assert.equal(await invalid.page.locator("#mobile-theme").inputValue(), "paper");
  assert.equal(await invalid.page.locator("#mobile-font").inputValue(), "sans");
  assert.equal(await invalid.page.evaluate(() => localStorage.getItem("blog.mobile.theme")), "neon");
  await invalid.context.close();
  results.push({ boundary: "invalid values default without rewriting", passed: true });

  const blocked = await openContext(360, () => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("Unavailable", "SecurityError"); },
    });
  });
  assert.equal(await blocked.page.locator("#mobile-theme").inputValue(), "paper");
  await blocked.page.selectOption("#mobile-theme", "dark");
  await blocked.page.selectOption("#mobile-font", "mono");
  assert.equal((await inspect(blocked.page)).theme, "dark");
  assert.equal((await inspect(blocked.page)).font, "mono");
  await blocked.context.close();
  results.push({ boundary: "unavailable storage still allows session changes", passed: true });

  const firstPaint = await openContext(375, () => {
    localStorage.setItem("blog.mobile.theme", "dark");
    localStorage.setItem("blog.mobile.font", "serif");
    window.atomThemeSamples = [];
    new MutationObserver(() => {
      if (document.querySelector(".m-atom")) {
        window.atomThemeSamples.push(document.documentElement.dataset.theme);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const samples = await firstPaint.page.evaluate(() => window.atomThemeSamples);
  assert.ok(samples.length > 0);
  assert.ok(samples.every((theme) => theme === "dark"));
  await firstPaint.page.locator("#mobile-theme").focus();
  await firstPaint.page.screenshot({ path: `${output}/375-dark-focus.png` });
  results.push({ boundary: "all observed atom insertion samples already dark", samples });
  await firstPaint.context.close();
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(`Passed ${results.length} browser scenarios; evidence: ${output}`);
} finally {
  await browser.close();
}
