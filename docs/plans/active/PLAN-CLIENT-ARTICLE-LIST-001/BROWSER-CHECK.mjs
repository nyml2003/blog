import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const { chromium } = await import(process.env.BLOG_PLAYWRIGHT_MODULE);
const origin = process.argv[2];
const output = process.env.BLOG_LIST_EVIDENCE_DIR;
assert.ok(origin, "Pass the integration origin");
assert.ok(output, "Set BLOG_LIST_EVIDENCE_DIR");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BLOG_CHROMIUM_PATH,
  headless: true,
});
const results = [];
const errors = [];

async function readData(response) {
  assert.equal(response.status(), 200);
  const envelope = await response.json();
  assert.equal(envelope.code, "OK");
  return envelope.data;
}

async function listMatches(page, data, selector) {
  assert.ok(data.items.length > 0, "Integration fixture must contain articles");
  for (const item of data.items) {
    assert.equal("contentHtml" in item, false);
  }
  await page.locator(selector).first().waitFor();
  assert.equal(await page.locator(selector).count(), data.items.length);
  assert.deepEqual(
    await page.locator(`${selector} h3`).allTextContents(),
    data.items.map((item) => item.title),
  );
  assert.equal(await page.locator('[role="alert"]').count(), 0);
}

async function capture(page, name, data) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  results.push({ name, url: page.url(), ...data });
}

try {
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  desktop.on("pageerror", (error) => errors.push(error.message));
  const publicResponse = desktop.waitForResponse((response) =>
    response.url().includes("sceneCode=public.article_list"),
  );
  await desktop.goto(`${origin}/articles/index.html`);
  const publicData = await readData(await publicResponse);
  await listMatches(desktop, publicData, ".archive-row");
  assert.equal(
    (await desktop.locator(".result-count").innerText()).trim(),
    `${publicData.total} 篇记录`,
  );
  await capture(desktop, "desktop-list", {
    total: publicData.total,
    rows: publicData.items.length,
  });

  const target = publicData.items.find((item) => item.terms.length > 0);
  assert.ok(target, "Filter fixture needs an article with a term");
  await desktop.selectOption("#filter-type", String(target.articleTypeId));
  await desktop.getByLabel(target.terms[0].name, { exact: true }).check();
  const filteredResponse = desktop.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.searchParams.get("sceneCode") === "public.article_list" &&
      url.searchParams.has("type_id") &&
      url.searchParams.has("term_ids")
    );
  });
  await desktop.locator('form.filters button[type="submit"]').click();
  const filtered = await readData(await filteredResponse);
  await listMatches(desktop, filtered, ".archive-row");
  for (const item of filtered.items) {
    assert.equal(item.articleTypeId, target.articleTypeId);
    assert.ok(item.termIds.includes(target.terms[0].id));
  }
  assert.equal(
    (await desktop.locator(".result-count").innerText()).trim(),
    `${filtered.total} 篇记录`,
  );
  await capture(desktop, "desktop-filtered", {
    total: filtered.total,
    rows: filtered.items.length,
  });

  const adminResponse = desktop.waitForResponse((response) =>
    response.url().includes("sceneCode=admin.article_list"),
  );
  await desktop.goto(`${origin}/admin/`);
  const adminData = await readData(await adminResponse);
  await listMatches(desktop, adminData, ".admin-row");
  assert.ok(adminData.items.some((item) => item.status === "draft"));
  assert.ok(adminData.items.some((item) => item.status === "published"));
  await capture(desktop, "admin-list", {
    total: adminData.total,
    rows: adminData.items.length,
  });

  await desktop.goto(`${origin}/articles/detail.html?id=${target.id}`);
  await desktop.locator(".article-body p").first().waitFor();
  await capture(desktop, "desktop-detail", { articleId: target.id });

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (error) => errors.push(error.message));
  const recommendationResponse = mobile.waitForResponse((response) =>
    response.url().includes("sceneCode=public.recommendation_current"),
  );
  await mobile.goto(`${origin}/m/`);
  const recommendations = await readData(await recommendationResponse);
  assert.ok(recommendations.length > 0);
  for (const article of recommendations)
    assert.equal(typeof article.contentHtml, "string");
  await mobile.locator('a[href*="/m/articles/detail.html"]').first().waitFor();
  assert.equal(
    await mobile.locator('a[href*="/m/articles/detail.html"]').count(),
    recommendations.length,
  );
  await capture(mobile, "mobile-home", {
    recommendations: recommendations.length,
  });

  const shelfResponse = mobile.waitForResponse((response) =>
    response.url().includes("sceneCode=public.mobile_article_shelf"),
  );
  await mobile.goto(`${origin}/m/articles/index.html`);
  const shelf = await readData(await shelfResponse);
  await mobile
    .locator('.shelf-content a[href*="/m/articles/detail.html"]')
    .first()
    .waitFor();
  const shelfCards = shelf.sections.reduce(
    (count, section) => count + section.articles.length,
    0,
  );
  assert.equal(
    await mobile
      .locator('.shelf-content a[href*="/m/articles/detail.html"]')
      .count(),
    shelfCards,
  );
  await capture(mobile, "mobile-shelf", {
    total: shelf.total,
    cards: shelfCards,
  });

  await mobile.goto(`${origin}/m/articles/detail.html?id=${target.id}`);
  await mobile.locator(".article-body p").first().waitFor();
  await capture(mobile, "mobile-detail", { articleId: target.id });
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/results.json`,
    `${JSON.stringify({ origin, results, errors }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ origin, results, errors }, null, 2));
} finally {
  await browser.close();
}
