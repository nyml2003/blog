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
    await this.waitFor(
      "document.readyState === 'complete'",
      `${path} document`,
    );
  }

  async screenshot(filename) {
    const image = await this.command("Page.captureScreenshot", {
      format: "png",
    });
    writeFileSync(
      `${evidenceDirectory}/${filename}`,
      Buffer.from(image.data, "base64"),
    );
  }

  close() {
    this.socket.close();
  }
}

async function createPage() {
  const target = await fetch(
    `${cdpOrigin}/json/new?${encodeURIComponent("about:blank")}`,
    {
      method: "PUT",
    },
  ).then((response) => response.json());
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
  const initialRequests = page
    .requestsFrom(requestMark)
    .filter((url) => url.includes("/api/public/t-shelf"));
  assert(
    initialRequests.length === 1,
    "desktop T shelf: initial load uses one shelf request",
    initialRequests,
  );
  assert(
    initialRequests[0].includes("surface=archive"),
    "desktop T shelf: initial request selects archive",
    initialRequests[0],
  );
  assert(
    initialRequests[0].includes("filter_id=all"),
    "desktop T shelf: initial request carries all filter",
    initialRequests[0],
  );
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
  const switchedRequests = page
    .requestsFrom(requestMarkAfterInitial)
    .filter((url) => url.includes("/api/public/t-shelf"));
  const switched = await page.evaluate(`(() => ({
    selected: document.querySelector('.t-shelf-filters [aria-pressed="true"]')?.textContent,
    articles: [...document.querySelectorAll('.archive-row h3')].map((heading) => heading.textContent),
  }))()`);
  assert(
    switched.selected === nextId,
    "desktop T shelf: selected filter updates",
    switched,
  );
  assert(
    switchedRequests.length === 1,
    "desktop T shelf: filter switch issues one new request",
    switchedRequests,
  );
  assert(
    switchedRequests[0].includes("filter_id="),
    "desktop T shelf: switch request carries a selected filter",
    switchedRequests[0],
  );
  assert(
    switched.articles.length > 0,
    "desktop T shelf: article region rerenders",
    switched,
  );
  await assertNoPageErrors(page, "desktop T shelf");
  await page.screenshot("desktop-t-shelf-filter-switch.png");
  report.pages.desktopTShelf = {
    initial,
    initialRequests,
    nextId,
    switched,
    switchedRequests,
  };
}

async function auditMobileTShelf(page) {
  await setViewport(page, 390, 844, true);
  const requestMark = page.events.length;
  await page.navigate("/m/");
  await page.waitFor(
    "document.querySelectorAll('.mobile-t-shelf [role=tab]').length > 1 && document.querySelectorAll('.mobile-t-shelf .article-card').length > 0",
    "mobile T shelf initial render",
  );
  const initialRequests = page
    .requestsFrom(requestMark)
    .filter((url) => url.includes("/api/public/t-shelf"));
  assert(
    initialRequests.length === 1,
    "mobile T shelf: initial load uses one shelf request",
    initialRequests,
  );
  assert(
    initialRequests[0].includes("surface=recommendation"),
    "mobile T shelf: initial request selects recommendation",
    initialRequests[0],
  );
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
  const switchedRequests = page
    .requestsFrom(requestMarkAfterInitial)
    .filter((url) => url.includes("/api/public/t-shelf"));
  const switched = await page.evaluate(`(() => ({
    selected: document.querySelector('.mobile-t-shelf [aria-selected="true"]')?.id,
    articleCount: document.querySelectorAll('.mobile-t-shelf .article-card').length,
    text: document.querySelector('.mobile-t-shelf-content')?.textContent,
  }))()`);
  assert(
    switched.selected === nextId,
    "mobile T shelf: selected filter updates",
    switched,
  );
  assert(
    switchedRequests.length === 1,
    "mobile T shelf: filter switch issues one new request",
    switchedRequests,
  );
  assert(
    switchedRequests[0].includes(`filter_id=${nextId.replace("tab-", "")}`),
    "mobile T shelf: switch request uses selected filter",
    switchedRequests[0],
  );
  assert(
    switched.articleCount > 0 || switched.text.includes("当前分类还没有文章"),
    "mobile T shelf: content rerenders to data or empty state",
    switched,
  );
  await assertNoPageErrors(page, "mobile T shelf");
  await page.screenshot("mobile-t-shelf-filter-switch.png");
  report.pages.mobileTShelf = {
    initialRequests,
    nextId,
    switched,
    switchedRequests,
  };
}

async function categoryShelfState(page) {
  return page.evaluate(`(() => {
    const hrefs = [...document.querySelectorAll('.category-shelf-cards .article-card')]
      .map((card) => card.getAttribute('href'))
      .filter(Boolean);
    const totalText = document.querySelector('.category-shelf-results > .m-atom-text--meta')?.textContent ?? '';
    return {
      selectedRoot: document.querySelector('.category-shelf-roots [aria-selected="true"]')?.id,
      selectedChild: document.querySelector('.category-shelf-children [aria-selected="true"]')?.id,
      categoryId: new URLSearchParams(location.search).get('category_id'),
      hrefs,
      uniqueArticleCount: new Set(hrefs).size,
      total: Number(totalText.match(/\\d+/)?.[0] ?? -1),
      scrollY,
      historyShelf: history.state?.mobileArticleShelf,
      url: location.href,
    };
  })()`);
}

async function selectAlternativeCategory(page, containerSelector) {
  return page.evaluate(`(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(containerSelector)} + ' [role=tab]')]
      .find((button) => button.getAttribute('aria-selected') !== 'true' && button.id !== 'tab-all');
    if (!target) throw new Error('Missing alternative category tab in ' + ${JSON.stringify(containerSelector)});
    target.click();
    return target.id.replace('tab-', '');
  })()`);
}

async function waitForCategoryShelf(page, path) {
  await page.navigate(path);
  await page.waitFor(
    "document.querySelectorAll('.category-shelf-roots [role=tab]').length > 1 && document.querySelectorAll('.category-shelf-children [role=tab]').length > 1 && document.querySelector('.category-shelf-results')?.getAttribute('aria-busy') === 'false'",
    `${path} category shelf initial render`,
  );
}

async function auditMobileCategoryShelf(page, path, reportKey, withHistory) {
  await setViewport(page, 390, 844, true);
  const initialRequestMark = page.events.length;
  await waitForCategoryShelf(page, path);
  const initial = await categoryShelfState(page);
  const initialRequests = page
    .requestsFrom(initialRequestMark)
    .filter((url) => url.includes("/api/public/mobile/category-shelf"));
  assert(
    initialRequests.length > 0,
    `${reportKey}: initial category request`,
    initialRequests,
  );
  assert(initial.selectedRoot, `${reportKey}: initial root selected`, initial);
  assert(
    initial.selectedChild,
    `${reportKey}: initial child selected`,
    initial,
  );

  const categoryHistoryScroll = await page.evaluate(`(() => {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    scrollTo(0, Math.min(480, maxScroll));
    return { maxScroll, requestedScroll: Math.min(480, maxScroll) };
  })()`);
  await page.waitFor(
    "scrollY > 0",
    `${reportKey} nonzero scroll before category navigation`,
  );
  const categoryHistoryLeaving = await categoryShelfState(page);
  await page.command("Network.emulateNetworkConditions", {
    offline: false,
    latency: 350,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const categoryHistoryRootId = await page.evaluate(`(() => {
    const target = [...document.querySelectorAll('.category-shelf-roots [role=tab]')]
      .find((button) => button.getAttribute('aria-selected') !== 'true');
    if (!target) throw new Error('Missing alternative root category');
    target.focus({ preventScroll: true });
    target.click();
    return target.id.replace('tab-', '');
  })()`);
  await page.waitFor(
    "document.querySelector('.category-shelf-results')?.getAttribute('aria-busy') === 'true'",
    `${reportKey} root category loading state`,
  );
  const loadingState = await page.evaluate(`(() => ({
    rootTabs: document.querySelectorAll('.category-shelf-roots [role=tab]').length,
    childTabs: document.querySelectorAll('.category-shelf-children [role=tab]').length,
    activeElementId: document.activeElement?.id,
    busy: document.querySelector('.category-shelf-results')?.getAttribute('aria-busy'),
  }))()`);
  await page.command("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  assert(
    loadingState.rootTabs > 1 && loadingState.childTabs > 1,
    `${reportKey}: category rails remain mounted while loading`,
    loadingState,
  );
  assert(
    loadingState.activeElementId === `tab-${categoryHistoryRootId}`,
    `${reportKey}: category tab keeps focus while loading`,
    loadingState,
  );
  await page.waitFor(
    `new URLSearchParams(location.search).get('category_id') === ${JSON.stringify(categoryHistoryRootId)} && document.querySelector('.category-shelf-results')?.getAttribute('aria-busy') === 'false'`,
    `${reportKey} category history destination`,
  );
  await page.evaluate("history.back()");
  await page.waitFor(
    `new URLSearchParams(location.search).get('category_id') === ${JSON.stringify(initial.categoryId)} && document.querySelector('.category-shelf-roots [aria-selected="true"]')?.id === ${JSON.stringify(initial.selectedRoot)} && document.querySelector('.category-shelf-results')?.getAttribute('aria-busy') === 'false'`,
    `${reportKey} category history URL and selection restoration`,
  );
  await pause(250);
  const categoryHistoryRestored = await categoryShelfState(page);
  assert(
    categoryHistoryRestored.categoryId === categoryHistoryLeaving.categoryId,
    `${reportKey}: category Back restores URL`,
    { categoryHistoryLeaving, categoryHistoryRestored },
  );
  assert(
    categoryHistoryRestored.selectedRoot ===
      categoryHistoryLeaving.selectedRoot &&
      categoryHistoryRestored.selectedChild ===
        categoryHistoryLeaving.selectedChild,
    `${reportKey}: category Back restores selection`,
    { categoryHistoryLeaving, categoryHistoryRestored },
  );
  assert(
    categoryHistoryRestored.scrollY === categoryHistoryLeaving.scrollY,
    `${reportKey}: category Back restores scroll position`,
    { categoryHistoryLeaving, categoryHistoryRestored },
  );

  const rootRequestMark = page.events.length;
  const rootId = await selectAlternativeCategory(page, ".category-shelf-roots");
  await page.waitFor(
    `new URLSearchParams(location.search).get('category_id') === ${JSON.stringify(rootId)} && document.querySelector('.category-shelf-results')?.getAttribute('aria-busy') === 'false'`,
    `${reportKey} root category response`,
  );
  const rootRequests = page
    .requestsFrom(rootRequestMark)
    .filter((url) => url.includes("/api/public/mobile/category-shelf"));
  const root = await categoryShelfState(page);
  assert(
    root.selectedRoot === `tab-${rootId}`,
    `${reportKey}: root category selection`,
    root,
  );
  assert(
    rootRequests.some((url) => url.includes(`category_id=${rootId}`)),
    `${reportKey}: root category refetch`,
    rootRequests,
  );
  assert(
    root.hrefs.length === root.uniqueArticleCount,
    `${reportKey}: parent aggregate deduplicates articles`,
    root,
  );
  assert(
    root.total === root.uniqueArticleCount,
    `${reportKey}: parent aggregate total matches cards`,
    root,
  );

  const childRequestMark = page.events.length;
  const childId = await selectAlternativeCategory(
    page,
    ".category-shelf-children",
  );
  await page.waitFor(
    `new URLSearchParams(location.search).get('category_id') === ${JSON.stringify(childId)} && document.querySelector('.category-shelf-results')?.getAttribute('aria-busy') === 'false'`,
    `${reportKey} child category response`,
  );
  const childRequests = page
    .requestsFrom(childRequestMark)
    .filter((url) => url.includes("/api/public/mobile/category-shelf"));
  const child = await categoryShelfState(page);
  assert(
    child.selectedChild === `tab-${childId}`,
    `${reportKey}: child category selection`,
    child,
  );
  assert(
    childRequests.some((url) => url.includes(`category_id=${childId}`)),
    `${reportKey}: child category refetch`,
    childRequests,
  );
  assert(
    child.hrefs.length === child.uniqueArticleCount,
    `${reportKey}: child articles stay deduplicated`,
    child,
  );

  const evidenceName = path.includes("list.html")
    ? "mobile-f-category-shelf-list.png"
    : "mobile-f-category-shelf-index.png";
  await page.screenshot(evidenceName);
  const pageReport = {
    initial,
    initialRequests,
    categoryHistory: {
      scroll: categoryHistoryScroll,
      leaving: categoryHistoryLeaving,
      destinationRootId: categoryHistoryRootId,
      loading: loadingState,
      restored: categoryHistoryRestored,
    },
    rootId,
    root,
    rootRequests,
    childId,
    child,
    childRequests,
  };
  if (!withHistory) {
    await assertNoPageErrors(page, reportKey);
    report.pages[reportKey] = pageReport;
    return;
  }

  await page.evaluate(
    "document.querySelector('.category-shelf-roots [aria-selected=true]')?.click()",
  );
  await page.waitFor(
    `new URLSearchParams(location.search).get('category_id') === ${JSON.stringify(rootId)} && document.querySelector('.category-shelf-results')?.getAttribute('aria-busy') === 'false' && document.querySelector('.category-shelf-cards .article-card')`,
    `${reportKey} parent articles for history`,
  );
  const beforeNavigate = await page.evaluate(`(() => {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    scrollTo(0, Math.min(640, maxScroll));
    return { maxScroll, url: location.href };
  })()`);
  await page.waitFor(
    "scrollY > 0",
    `${reportKey} nonzero scroll before detail`,
  );
  const leaving = await categoryShelfState(page);
  const href = leaving.hrefs[0];
  assert(href, `${reportKey}: history scenario has an article`, leaving);
  await page.evaluate(
    `document.querySelector(${JSON.stringify(`a[href="${href}"]`)})?.click()`,
  );
  await page.waitFor(
    "location.pathname === '/m/articles/detail.html' && document.querySelector('.mobile-article')",
    "mobile article detail",
  );
  const detail = await page.evaluate(
    "({ url: location.href, referrer: document.referrer, title: document.querySelector('.mobile-article h1')?.textContent })",
  );
  assert(
    detail.referrer.includes(path),
    `${reportKey}: detail referrer remains category shelf route`,
    detail,
  );
  await page.evaluate("document.querySelector('.detail-footer a')?.click()");
  await page.waitFor(
    `location.pathname === ${JSON.stringify(path)} && document.querySelector('.category-shelf-layout') && scrollY > 0`,
    `history back to ${reportKey}`,
  );
  const restored = await categoryShelfState(page);
  assert(
    restored.categoryId === leaving.categoryId,
    `${reportKey}: history restores category URL`,
    { leaving, restored },
  );
  assert(
    restored.selectedRoot === leaving.selectedRoot &&
      restored.selectedChild === leaving.selectedChild,
    `${reportKey}: history restores category selection`,
    { leaving, restored },
  );
  assert(
    restored.scrollY === leaving.scrollY,
    `${reportKey}: history restores scroll position`,
    { leaving, restored },
  );
  await assertNoPageErrors(page, `${reportKey} and history`);
  await page.screenshot("mobile-f-category-shelf-history-restored.png");
  report.pages[reportKey] = {
    ...pageReport,
    beforeNavigate,
    leaving,
    href,
    detail,
    restored,
  };
}

async function main() {
  mkdirSync(evidenceDirectory, { recursive: true });
  const page = await createPage();
  try {
    await auditDesktopTShelf(page);
    await auditMobileTShelf(page);
    await auditMobileCategoryShelf(
      page,
      "/m/articles/index.html",
      "mobileCategoryShelfIndex",
      true,
    );
    await auditMobileCategoryShelf(
      page,
      "/m/articles/list.html",
      "mobileCategoryShelfList",
      false,
    );
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
