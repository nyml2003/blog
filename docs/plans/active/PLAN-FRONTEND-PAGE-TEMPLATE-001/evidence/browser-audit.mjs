import { mkdirSync, writeFileSync } from "node:fs";

const origin = process.env.BLOG_AUDIT_ORIGIN ?? "http://127.0.0.1:18084";
const cdpOrigin = process.env.BLOG_AUDIT_CDP ?? "http://127.0.0.1:9229";
const evidenceDirectory =
  process.env.BLOG_AUDIT_EVIDENCE_DIR ?? "/tmp/blog-page-audit/evidence";
const reportPath = `${evidenceDirectory}/report.json`;
const report = {
  origin,
  startedAt: new Date().toISOString(),
  checks: [],
  pages: {},
  errors: [],
};

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message, detail = undefined) {
  report.checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(message);
}

function valueOf(result) {
  if (result.exceptionDetails) {
    throw new Error(`Page evaluation failed: ${result.exceptionDetails.text}`);
  }
  return result.result.value;
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      this.events.push(message);
    });
  }

  command(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    return valueOf(
      await this.command("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      }),
    );
  }

  requestsFrom(mark) {
    return this.events
      .slice(mark)
      .filter((event) => event.method === "Network.requestWillBeSent")
      .map((event) => event.params.request.url)
      .filter((url) => url.includes("/api/"));
  }

  async waitFor(expression, description, timeout = 8_000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.evaluate(expression)) return;
      await pause(50);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async navigate(path) {
    await this.command("Page.navigate", { url: `${origin}${path}` });
    await this.waitFor("document.readyState === 'complete'", `${path} document`);
  }

  async screenshot(filename) {
    const image = await this.command("Page.captureScreenshot", {
      format: "png",
    });
    writeFileSync(`${evidenceDirectory}/${filename}`, Buffer.from(image.data, "base64"));
  }

  close() {
    this.socket.close();
  }
}

async function createPage() {
  const target = await fetch(`${cdpOrigin}/json/new?${encodeURIComponent("about:blank")}`, {
    method: "PUT",
  }).then((response) => response.json());
  const page = new Cdp(target.webSocketDebuggerUrl);
  await page.connect();
  await page.command("Page.enable");
  await page.command("Runtime.enable");
  await page.command("Network.enable");
  await page.command("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__blogAuditErrors = [];
      addEventListener("error", (event) => window.__blogAuditErrors.push(event.message));
      addEventListener("unhandledrejection", (event) => window.__blogAuditErrors.push(String(event.reason)));
    `,
  });
  return page;
}

async function setViewport(page, width, height, mobile) {
  await page.command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function assertNoPageErrors(page, label) {
  const errors = await page.evaluate("window.__blogAuditErrors ?? []");
  report.errors.push(...errors.map((message) => ({ label, message })));
  assert(errors.length === 0, `${label}: no page errors`, errors);
}

async function auditDesktopTShelf(page) {
  await setViewport(page, 1440, 980, false);
  const requestMark = page.events.length;
  await page.navigate("/articles/index.html");
  await page.waitFor(
    "document.querySelectorAll('.t-shelf-filters button').length > 1 && document.querySelectorAll('.archive-row').length > 0",
    "desktop T shelf initial render",
  );
  const initial = await page.evaluate(`(() => ({
    selected: document.querySelector('.t-shelf-filters [aria-pressed="true"]')?.textContent,
    filters: [...document.querySelectorAll('.t-shelf-filters button')].map((button) => ({ text: button.textContent, selected: button.getAttribute('aria-pressed') })),
    articles: [...document.querySelectorAll('.archive-row h3')].map((heading) => heading.textContent),
  }))()`);
  const initialRequests = page.requestsFrom(requestMark).filter((url) => url.includes("/api/public/t-shelf"));
  assert(initialRequests.length === 1, "desktop T shelf: initial load uses one shelf request", initialRequests);
  assert(initialRequests[0].includes("surface=archive"), "desktop T shelf: initial request selects archive", initialRequests[0]);
  assert(initialRequests[0].includes("filter_id=all"), "desktop T shelf: initial request carries all filter", initialRequests[0]);
  const requestMarkAfterInitial = page.events.length;
  const nextId = await page.evaluate(`(() => {
    const target = [...document.querySelectorAll('.t-shelf-filters button')].find((button) => button.getAttribute('aria-pressed') !== 'true');
    if (!target) throw new Error('Missing alternative desktop shelf filter');
    target.click();
    return target.textContent;
  })()`);
  await page.waitFor(
    `document.querySelector('.t-shelf-filters [aria-pressed="true"]')?.textContent === ${JSON.stringify(nextId)} && document.querySelectorAll('.archive-row').length > 0`,
    "desktop T shelf switched render",
  );
  const switchedRequests = page.requestsFrom(requestMarkAfterInitial).filter((url) => url.includes("/api/public/t-shelf"));
  const switched = await page.evaluate(`(() => ({
    selected: document.querySelector('.t-shelf-filters [aria-pressed="true"]')?.textContent,
    articles: [...document.querySelectorAll('.archive-row h3')].map((heading) => heading.textContent),
  }))()`);
  assert(switched.selected === nextId, "desktop T shelf: selected filter updates", switched);
  assert(switchedRequests.length === 1, "desktop T shelf: filter switch issues one new request", switchedRequests);
  assert(switchedRequests[0].includes("filter_id="), "desktop T shelf: switch request carries a selected filter", switchedRequests[0]);
  assert(switched.articles.length > 0, "desktop T shelf: article region rerenders", switched);
  await assertNoPageErrors(page, "desktop T shelf");
  await page.screenshot("desktop-t-shelf-filter-switch.png");
  report.pages.desktopTShelf = { initial, initialRequests, nextId, switched, switchedRequests };
}

async function auditMobileTShelf(page) {
  await setViewport(page, 390, 844, true);
  const requestMark = page.events.length;
  await page.navigate("/m/");
  await page.waitFor(
    "document.querySelectorAll('.mobile-t-shelf [role=tab]').length > 1 && document.querySelectorAll('.mobile-t-shelf .article-card').length > 0",
    "mobile T shelf initial render",
  );
  const initialRequests = page.requestsFrom(requestMark).filter((url) => url.includes("/api/public/t-shelf"));
  assert(initialRequests.length === 1, "mobile T shelf: initial load uses one shelf request", initialRequests);
  assert(initialRequests[0].includes("surface=recommendation"), "mobile T shelf: initial request selects recommendation", initialRequests[0]);
  const requestMarkAfterInitial = page.events.length;
  const nextId = await page.evaluate(`(() => {
    const target = [...document.querySelectorAll('.mobile-t-shelf [role=tab]')].find((button) => button.getAttribute('aria-selected') !== 'true');
    if (!target) throw new Error('Missing alternative mobile shelf filter');
    target.click();
    return target.id;
  })()`);
  await page.waitFor(
    `document.querySelector('.mobile-t-shelf [aria-selected="true"]')?.id === ${JSON.stringify(nextId)}`,
    "mobile T shelf selection",
  );
  await pause(150);
  const switchedRequests = page.requestsFrom(requestMarkAfterInitial).filter((url) => url.includes("/api/public/t-shelf"));
  const switched = await page.evaluate(`(() => ({
    selected: document.querySelector('.mobile-t-shelf [aria-selected="true"]')?.id,
    articleCount: document.querySelectorAll('.mobile-t-shelf .article-card').length,
    text: document.querySelector('.mobile-t-shelf-content')?.textContent,
  }))()`);
  assert(switched.selected === nextId, "mobile T shelf: selected filter updates", switched);
  assert(switchedRequests.length === 1, "mobile T shelf: filter switch issues one new request", switchedRequests);
  assert(switchedRequests[0].includes(`filter_id=${nextId.replace("tab-", "")}`), "mobile T shelf: switch request uses selected filter", switchedRequests[0]);
  assert(switched.articleCount > 0 || switched.text.includes("当前分类还没有文章"), "mobile T shelf: content rerenders to data or empty state", switched);
  await assertNoPageErrors(page, "mobile T shelf");
  await page.screenshot("mobile-t-shelf-filter-switch.png");
  report.pages.mobileTShelf = { initialRequests, nextId, switched, switchedRequests };
}

async function auditMobileShelfAndHistory(page) {
  await setViewport(page, 390, 844, true);
  await page.navigate("/m/articles/index.html");
  await page.waitFor(
    "document.querySelectorAll('.shelf-index [role=tab]').length > 1 && document.querySelectorAll('.shelf-section .article-card').length > 0",
    "mobile F shelf initial render",
  );
  const before = await page.evaluate(`(() => ({
    selected: document.querySelector('.shelf-index [aria-selected="true"]')?.id,
    scrollY,
    sections: [...document.querySelectorAll('.shelf-section')].map((section) => section.id),
  }))()`);
  const nextId = await page.evaluate(`(() => {
    const target = [...document.querySelectorAll('.shelf-index [role=tab]')].find((button) => button.getAttribute('aria-selected') !== 'true');
    if (!target) throw new Error('Missing alternative F shelf section');
    target.click();
    return target.id;
  })()`);
  await page.waitFor(
    `document.querySelector('.shelf-index [aria-selected="true"]')?.id === ${JSON.stringify(nextId)}`,
    "mobile F shelf section selection",
  );
  await pause(850);
  const focused = await page.evaluate(`(() => {
    const selected = document.querySelector('.shelf-index [aria-selected="true"]')?.id;
    const target = document.querySelector('#shelf-' + selected?.replace('tab-', ''));
    return { selected, scrollY, targetTop: target?.getBoundingClientRect().top, targetId: target?.id };
  })()`);
  assert(focused.selected === nextId, "mobile F shelf: section selection remains stable through scroll", focused);
  assert(focused.scrollY > before.scrollY, "mobile F shelf: selecting section scrolls to its shelf", { before, focused });
  assert(Math.abs(focused.targetTop) < 180, "mobile F shelf: selected section reaches sticky reading position", focused);
  await page.screenshot("mobile-f-shelf-section-focus.png");
  const href = await page.evaluate(`(() => {
    const selected = document.querySelector('.shelf-index [aria-selected="true"]')?.id;
    const link = document.querySelector('#shelf-' + selected?.replace('tab-', '') + ' .article-card');
    if (!(link instanceof HTMLAnchorElement)) throw new Error('Missing selected shelf article link');
    return link.href;
  })()`);
  const beforeNavigate = await page.evaluate("({ scrollY, selected: document.querySelector('.shelf-index [aria-selected=\"true\"]')?.id })");
  await page.evaluate(`document.querySelector(${JSON.stringify(`a[href="${new URL(href).pathname}${new URL(href).search}"]`)})?.click()`);
  await page.waitFor("location.pathname === '/m/articles/detail.html' && document.querySelector('.mobile-article')", "mobile article detail");
  const detail = await page.evaluate("({ url: location.href, referrer: document.referrer, title: document.querySelector('.mobile-article h1')?.textContent })");
  assert(detail.referrer.endsWith("/m/articles/index.html"), "mobile detail: referrer remains F shelf route", detail);
  await page.evaluate("document.querySelector('.detail-footer a')?.click()");
  await page.waitFor("location.pathname === '/m/articles/index.html' && document.querySelector('.shelf-layout')", "history back to mobile F shelf");
  await pause(400);
  const restored = await page.evaluate("({ scrollY, selected: document.querySelector('.shelf-index [aria-selected=\"true\"]')?.id })");
  assert(restored.scrollY > 0, "mobile detail return: browser restores F shelf scroll position", { focused, restored });
  await assertNoPageErrors(page, "mobile F shelf and history");
  await page.screenshot("mobile-f-shelf-history-restored.png");
  report.pages.mobileFShelf = { before, nextId, focused, href, beforeNavigate, detail, restored };
}

async function auditMobileBrowse(page) {
  await setViewport(page, 390, 844, true);
  const requestMark = page.events.length;
  await page.navigate("/m/articles/list.html");
  await page.waitFor(
    "document.querySelectorAll('.browse-types [role=tab]').length > 1 && document.querySelectorAll('.browse-list .article-card').length > 0 && document.querySelector('.browse-more button')",
    "mobile browse initial render",
  );
  const initial = await page.evaluate("({ cards: document.querySelectorAll('.browse-list .article-card').length, progress: document.querySelector('.browse-more')?.textContent, url: location.href })");
  const initialRequests = page.requestsFrom(requestMark).filter((url) => url.includes("/api/public/articles"));
  const requestMarkMore = page.events.length;
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('.browse-more button')].find((entry) => entry.textContent?.includes('加载更多'));
    if (!button) throw new Error('Missing load more button');
    button.click();
  })()`);
  await page.waitFor(
    `document.querySelectorAll('.browse-list .article-card').length > ${initial.cards}`,
    "mobile browse load more",
  );
  const afterMore = await page.evaluate("({ cards: document.querySelectorAll('.browse-list .article-card').length, progress: document.querySelector('.browse-more')?.textContent })");
  const moreRequests = page.requestsFrom(requestMarkMore).filter((url) => url.includes("/api/public/articles"));
  assert(afterMore.cards > initial.cards, "mobile browse: load more appends article cards", { initial, afterMore });
  assert(moreRequests.some((url) => url.includes("page=2")), "mobile browse: load more requests second page", moreRequests);
  const requestMarkType = page.events.length;
  const typeId = await page.evaluate(`(() => {
    const target = [...document.querySelectorAll('.browse-types [role=tab]')].find((button) => button.getAttribute('aria-selected') !== 'true');
    if (!target) throw new Error('Missing alternative browse type');
    target.click();
    return target.id.replace('tab-', '');
  })()`);
  await page.waitFor(`new URLSearchParams(location.search).get('type') === ${JSON.stringify(typeId)}`, "mobile browse type URL");
  await page.waitFor("document.querySelectorAll('.browse-list .article-card').length > 0", "mobile browse type render");
  const afterType = await page.evaluate("({ cards: document.querySelectorAll('.browse-list .article-card').length, url: location.href })");
  const typeRequests = page.requestsFrom(requestMarkType).filter((url) => url.includes("/api/public/articles"));
  assert(typeRequests.some((url) => url.includes(`type_id=${typeId}`)), "mobile browse: type selection refetches with type id", typeRequests);
  const requestMarkTopic = page.events.length;
  const topicId = await page.evaluate(`(() => {
    const target = [...document.querySelectorAll('[aria-label="按主题筛选"] [role=radio]')].find((button) => button.getAttribute('aria-checked') !== 'true');
    if (!target) throw new Error('Missing alternative browse topic');
    target.click();
    return target.id.replace('chip-', '');
  })()`);
  await page.waitFor(`new URLSearchParams(location.search).get('topic') === ${JSON.stringify(topicId)} && document.querySelector('[aria-label="按标签筛选"]')`, "mobile browse topic and tag cascade");
  const topicRequests = page.requestsFrom(requestMarkTopic).filter((url) => url.includes("/api/public/articles"));
  assert(topicRequests.some((url) => url.includes(`topic_id=${topicId}`)), "mobile browse: topic selection refetches with topic id", topicRequests);
  const requestMarkTag = page.events.length;
  const tagId = await page.evaluate(`(() => {
    const target = [...document.querySelectorAll('[aria-label="按标签筛选"] [role=radio]')].find((button) => button.getAttribute('aria-checked') !== 'true');
    if (!target) throw new Error('Missing alternative browse tag');
    target.click();
    return target.id.replace('chip-', '');
  })()`);
  await page.waitFor(`new URLSearchParams(location.search).get('tag') === ${JSON.stringify(tagId)}`, "mobile browse tag URL");
  const tagRequests = page.requestsFrom(requestMarkTag).filter((url) => url.includes("/api/public/articles"));
  assert(tagRequests.some((url) => url.includes(`tag_id=${tagId}`)), "mobile browse: tag selection refetches with tag id", tagRequests);
  const final = await page.evaluate("({ cards: document.querySelectorAll('.browse-list .article-card').length, url: location.href, tagVisible: Boolean(document.querySelector('[aria-label=\"按标签筛选\"]')) })");
  assert(final.tagVisible, "mobile browse: third-level tag control remains visible after selection", final);
  await assertNoPageErrors(page, "mobile F browse");
  await page.screenshot("mobile-f-browse-three-level-and-load-more.png");
  report.pages.mobileBrowse = { initial, initialRequests, afterMore, moreRequests, typeId, afterType, typeRequests, topicId, topicRequests, tagId, tagRequests, final };
}

async function main() {
  mkdirSync(evidenceDirectory, { recursive: true });
  const page = await createPage();
  try {
    await auditDesktopTShelf(page);
    await auditMobileTShelf(page);
    await auditMobileShelfAndHistory(page);
    await auditMobileBrowse(page);
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failure = error instanceof Error ? error.message : String(error);
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    page.close();
  }
  if (!report.passed) process.exitCode = 1;
}

await main();
