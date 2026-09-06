import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

const origin = process.argv[2];
assert.ok(
  origin?.startsWith("http://127.0.0.1:"),
  "Use the isolated local integration server",
);
assert.ok(
  process.env.BLOG_PLAYWRIGHT_MODULE,
  "Set BLOG_PLAYWRIGHT_MODULE to playwright-core/index.mjs",
);
const { chromium } = await import(process.env.BLOG_PLAYWRIGHT_MODULE);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BLOG_CHROMIUM_PATH,
});
const screenshots = "src/target/html-validation";
mkdirSync(screenshots, { recursive: true });
const source =
  '<h2>问题定位</h2><p>这是合法的中文正文，包含 <code>Rust</code> 与受控链接。</p><h3>操作步骤</h3><ul><li>记录输入</li><li>检查输出</li></ul><ol><li>保存</li><li>发布</li></ol><pre><code>cargo test --workspace\nlet value = 42;</code></pre><blockquote><p>保留关键证据。</p></blockquote><table><thead><tr><th>项目</th><th>状态</th></tr></thead><tbody><tr><td>校验</td><td>通过</td></tr></tbody></table><p><a href="https://example.com/docs?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">参考资料</a></p>';
const errors = [];

async function api(sceneCode, body) {
  const response = await fetch(`${origin}/api/admin/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sceneCode, ...body }),
  });
  return { status: response.status, envelope: await response.json() };
}

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/admin/articles/new.html`);
  await page.locator("#title").fill("HTML v1 浏览器验收");
  await page.locator("#summary").fill("诊断、草稿、发布和跨端阅读验收");
  await page.locator("#article-type").selectOption("1");
  await page.locator(".term-picker input").first().check();
  const invalid = "<p>中🙂\n&unknown;</p>";
  await page.locator("#html").fill(invalid);
  await page.getByText("HTML_INVALID_ENTITY", { exact: true }).waitFor();
  assert.ok(
    await page.getByRole("button", { name: "预览", exact: true }).isDisabled(),
  );
  assert.ok(
    await page
      .getByRole("button", { name: "保存并发布", exact: true })
      .isDisabled(),
  );
  await page.locator(".diagnostic-location").click();
  assert.equal(
    await page
      .locator("#html")
      .evaluate((element) =>
        element.value.slice(element.selectionStart, element.selectionEnd),
      ),
    "&unknown;",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByText("文章已保存", { exact: true }).waitFor();
  assert.equal(await page.locator("#html").inputValue(), invalid);
  assert.equal(
    await page.locator("#summary").inputValue(),
    "诊断、草稿、发布和跨端阅读验收",
  );
  assert.ok(await page.locator(".term-picker input").first().isChecked());
  const id = Number(new URL(page.url()).searchParams.get("id"));
  assert.ok(id > 0);
  const rejected = await api("admin.article_publish", {
    id,
    contentHtml: "<p>forged</p>",
    htmlInspection: { valid: true },
  });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.envelope.code, "INVALID_ARTICLE_HTML");
  await page.screenshot({
    path: `${screenshots}/editor-invalid.png`,
    fullPage: true,
  });

  await page.locator("#html").fill(source);
  await page.getByText("正文校验通过", { exact: true }).waitFor();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await page.locator(".article-body h2").waitFor();
  await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  await page.getByText("文章已保存并发布", { exact: true }).waitFor();
  await page.screenshot({
    path: `${screenshots}/preview-valid.png`,
    fullPage: true,
  });

  for (const [name, width, height, path] of [
    ["desktop", 1440, 1000, "/articles/detail.html"],
    ["mobile", 375, 812, "/m/articles/detail.html"],
    ["mobile-landscape", 812, 375, "/m/articles/detail.html"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}${path}?id=${id}`);
    await page.locator(".article-body table").waitFor();
    const dom = await page.locator(".article-body").evaluate((body) => ({
      headings: body.querySelectorAll("h2,h3").length,
      lists: body.querySelectorAll("ul,ol").length,
      blocked: body.querySelectorAll(
        "script,img,style,iframe,[class],[style],[onclick],[onerror]",
      ).length,
      linkTarget: body.querySelector("a").target,
      linkRel: body.querySelector("a").rel,
      noOverflow: document.documentElement.scrollWidth <= innerWidth,
    }));
    assert.deepEqual(
      dom,
      {
        headings: 2,
        lists: 2,
        blocked: 0,
        linkTarget: "_blank",
        linkRel: "noopener noreferrer",
        noOverflow: true,
      },
      name,
    );
    await page.screenshot({
      path: `${screenshots}/${name}-valid.png`,
      fullPage: true,
    });
  }

  const stored = await fetch(
    `${origin}/api/admin/articles?sceneCode=admin.article_detail&id=${id}`,
  ).then((response) => response.json());
  await page.evaluate((article) => {
    article.contentHtml = "<img src='x' onerror='window.__htmlExecuted=true'>";
    article.htmlInspection = {
      valid: true,
      profileVersion: "article-html/v1",
      diagnostics: [],
    };
    sessionStorage.setItem("admin.article.preview", JSON.stringify(article));
  }, stored.data);
  await page.goto(`${origin}/admin/articles/preview.html?id=${id}`);
  await page.getByText("正文校验未通过", { exact: true }).waitFor();
  assert.equal(await page.locator(".article-body").count(), 0);
  assert.equal(await page.evaluate(() => window.__htmlExecuted), undefined);
  await page.screenshot({
    path: `${screenshots}/preview-blocked.png`,
    fullPage: true,
  });

  const offline = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await offline.route("**/*.wasm", (route) => route.abort());
  const failed = await offline.newPage();
  await failed.goto(`${origin}/admin/articles/new.html`);
  await failed.locator("#title").fill("WASM 加载失败仍可保存草稿");
  await failed.locator("#article-type").selectOption("1");
  await failed.locator("#html").fill(source);
  await failed.getByRole("button", { name: "重新校验", exact: true }).waitFor();
  assert.ok(
    await failed
      .getByRole("button", { name: "预览", exact: true })
      .isDisabled(),
  );
  await failed.getByRole("button", { name: "保存", exact: true }).click();
  await failed.getByText("文章已保存", { exact: true }).waitFor();
  assert.equal(await failed.locator("#html").inputValue(), source);
  assert.ok(
    await failed
      .getByRole("button", { name: "预览", exact: true })
      .isDisabled(),
  );
  await offline.unroute("**/*.wasm");
  await failed.getByRole("button", { name: "重新校验", exact: true }).click();
  await failed.getByText("正文校验通过", { exact: true }).waitFor();
  await failed.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "预览",
      ).disabled,
  );
  await failed
    .locator("#html")
    .fill("<script>window.__htmlExecuted=true</script>");
  assert.ok(
    await failed
      .getByRole("button", { name: "预览", exact: true })
      .isDisabled(),
  );
  await failed.getByText("HTML_UNSUPPORTED_ELEMENT", { exact: true }).waitFor();
  await failed.route("**/api/admin/articles", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "UNAVAILABLE",
        message: "simulated save failure",
        data: null,
      }),
    }),
  );
  await failed.getByRole("button", { name: "保存", exact: true }).click();
  await failed.getByText("simulated save failure", { exact: true }).waitFor();
  assert.equal(
    await failed.locator("#html").inputValue(),
    "<script>window.__htmlExecuted=true</script>",
  );
  assert.equal(
    await failed.locator("#title").inputValue(),
    "WASM 加载失败仍可保存草稿",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      articleId: id,
      screenshots,
      checks: [
        "invalid draft save",
        "UTF-8 location",
        "forged direct publish rejected",
        "valid preview and publish",
        "desktop/mobile rendering",
        "poisoned cache blocked",
        "WASM load failure and retry",
        "stale result blocked",
        "network error retains input",
      ],
    }),
  );
} finally {
  await browser.close();
}
