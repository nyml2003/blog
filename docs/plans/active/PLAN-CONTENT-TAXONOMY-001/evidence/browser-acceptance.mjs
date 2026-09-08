import { mkdirSync, writeFileSync } from "node:fs";

const origin = process.env.BLOG_AUDIT_ORIGIN ?? "http://127.0.0.1:18080";
const cdpOrigin = process.env.BLOG_AUDIT_CDP ?? "http://127.0.0.1:9229";
const evidenceDirectory =
  process.env.BLOG_AUDIT_EVIDENCE_DIR ??
  new URL("./browser", import.meta.url).pathname;
const password = process.env.BLOG_AUDIT_PASSWORD;
const recoveryCode = process.env.BLOG_AUDIT_RECOVERY_CODE;

if (!password || !recoveryCode) {
  throw new Error(
    "BLOG_AUDIT_PASSWORD and BLOG_AUDIT_RECOVERY_CODE are required",
  );
}

mkdirSync(evidenceDirectory, { recursive: true });

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

  async waitFor(expression, description, timeout = 10_000) {
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
      captureBeyondViewport: true,
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
    { method: "PUT" },
  ).then((response) => response.json());
  const page = new Cdp(target.webSocketDebuggerUrl);
  await page.connect();
  await page.command("Page.enable");
  await page.command("Runtime.enable");
  await page.command("Network.enable");
  await page.command("Network.clearBrowserCookies");
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

async function pageFacts(page) {
  return page.evaluate(`(() => ({
    path: location.pathname,
    search: location.search,
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim(),
    bodyText: document.body.innerText,
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
    pageErrors: window.__blogAuditErrors ?? [],
  }))()`);
}

function assertPageIntegrity(facts, label) {
  assert(
    facts.contentWidth <= facts.viewportWidth,
    `${label}: no horizontal overflow`,
    { contentWidth: facts.contentWidth, viewportWidth: facts.viewportWidth },
  );
  assert(
    facts.pageErrors.length === 0,
    `${label}: no page errors`,
    facts.pageErrors,
  );
  report.errors.push(
    ...facts.pageErrors.map((message) => ({ label, message })),
  );
}

async function fill(page, selector, value) {
  await page.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function auditLoginAndWorkspace(page) {
  await setViewport(page, 1440, 980, false);
  await page.navigate("/admin/content/workspace.html");
  await page.waitFor(
    "location.pathname === '/admin/login.html' && document.querySelector('form.login-form') !== null",
    "admin login redirect",
  );
  const login = await pageFacts(page);
  assert(
    login.heading === "管理台登录",
    "login: page is visible",
    login.heading,
  );
  assert(
    new URLSearchParams(login.search).get("next") ===
      "/admin/content/workspace.html",
    "login: protected destination is preserved",
    login.search,
  );
  assertPageIntegrity(login, "login desktop");
  await page.screenshot("desktop-admin-login.png");

  await page.evaluate(`(() => {
    const controls = document.querySelectorAll('[name="verification-kind"]');
    if (controls.length !== 2) throw new Error('Missing verification controls');
    controls[1].click();
  })()`);
  await page.waitFor(
    "document.querySelector('label[for=admin-verification-code]')?.textContent?.trim() === '恢复码'",
    "recovery verification selection",
  );
  await fill(page, "#admin-password", password);
  await fill(page, "#admin-verification-code", recoveryCode);
  await page.evaluate(
    "document.querySelector('form.login-form').requestSubmit()",
  );
  await page.waitFor(
    "location.pathname === '/admin/content/workspace.html'",
    "authenticated workspace navigation",
  );
  await page.waitFor(
    "document.body.innerText.includes('分类树与发布批次') && document.body.innerText.includes('活跃 PR')",
    "workspace data",
  );
  const workspace = await pageFacts(page);
  assert(
    workspace.bodyText.includes("#2"),
    "workspace: real active pull request is visible",
  );
  assert(
    workspace.bodyText.includes("已提交"),
    "workspace: submitted state is visible",
  );
  assert(
    workspace.bodyText.includes("退出"),
    "workspace: authenticated navigation is visible",
  );
  assertPageIntegrity(workspace, "workspace desktop");
  await page.screenshot("desktop-content-workspace.png");
  report.pages.login = {
    path: login.path,
    search: login.search,
    heading: login.heading,
  };
  report.pages.workspace = {
    path: workspace.path,
    heading: workspace.heading,
    activePullRequest: 2,
  };
}

async function auditDesktopPublic(page) {
  await setViewport(page, 1440, 980, false);
  await page.navigate("/articles/index.html");
  await page.waitFor(
    "document.body.innerText.includes('GitHub workflow acceptance')",
    "desktop public article",
  );
  const facts = await pageFacts(page);
  assert(
    !(await page.evaluate(
      "[...document.querySelectorAll('a')].some((link) => link.getAttribute('href')?.startsWith('/admin'))",
    )),
    "desktop public: no admin navigation is exposed",
  );
  assert(
    !facts.bodyText.includes("GitHub pending article"),
    "desktop public: pending article is not exposed",
  );
  assertPageIntegrity(facts, "public desktop");
  await page.screenshot("desktop-public-articles.png");
  report.pages.desktopPublic = {
    path: facts.path,
    heading: facts.heading,
    publishedArticle: "GitHub workflow acceptance",
  };
}

async function auditMobilePublic(page) {
  await setViewport(page, 390, 844, true);
  await page.navigate("/m/articles/detail.html?id=1");
  await page.waitFor(
    "document.body.innerText.includes('GitHub workflow acceptance')",
    "mobile public article",
  );
  const facts = await pageFacts(page);
  assert(
    !(await page.evaluate(
      "[...document.querySelectorAll('a')].some((link) => link.getAttribute('href')?.startsWith('/admin'))",
    )),
    "mobile public: no admin navigation is exposed",
  );
  assert(
    !facts.bodyText.includes("GitHub pending article"),
    "mobile public: pending article is not exposed",
  );
  assertPageIntegrity(facts, "public mobile");
  await page.screenshot("mobile-public-home.png");
  report.pages.mobilePublic = {
    path: facts.path,
    heading: facts.heading,
    publishedArticle: "GitHub workflow acceptance",
  };
}

let page;
try {
  page = await createPage();
  await auditLoginAndWorkspace(page);
  await auditDesktopPublic(page);
  await auditMobilePublic(page);
  report.completedAt = new Date().toISOString();
  report.passed = true;
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.passed = false;
  report.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  writeFileSync(
    `${evidenceDirectory}/report.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  page?.close();
}
