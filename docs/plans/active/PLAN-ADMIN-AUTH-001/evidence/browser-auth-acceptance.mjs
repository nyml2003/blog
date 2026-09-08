import { mkdirSync, writeFileSync } from "node:fs";

const authenticatedOrigin =
  process.env.BLOG_AUTH_AUDIT_ORIGIN ?? "http://127.0.0.1:18083";
const unavailableOrigin =
  process.env.BLOG_AUTH_AUDIT_UNAVAILABLE_ORIGIN ?? "http://127.0.0.1:18082";
const cdpOrigin = process.env.BLOG_AUTH_AUDIT_CDP ?? "http://127.0.0.1:9230";
const evidenceDirectory = new URL("./browser", import.meta.url).pathname;
const password = process.env.BLOG_AUTH_AUDIT_PASSWORD;
const recoveryCode = process.env.BLOG_AUTH_AUDIT_RECOVERY_CODE;

if (!password || !recoveryCode) {
  throw new Error(
    "BLOG_AUTH_AUDIT_PASSWORD and BLOG_AUTH_AUDIT_RECOVERY_CODE are required",
  );
}

mkdirSync(evidenceDirectory, { recursive: true });

const report = {
  authenticatedOrigin,
  unavailableOrigin,
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

  async navigate(origin, path) {
    await this.command("Page.navigate", { url: `${origin}${path}` });
    await this.waitFor(
      "document.readyState === 'complete'",
      `${path} document`,
    );
  }

  responseStatuses(mark, path) {
    const responses = this.events
      .slice(mark)
      .filter((event) => event.method === "Network.responseReceived")
      .filter((event) => new URL(event.params.response.url).pathname === path)
      .map((event) => event.params.response.status);
    const redirects = this.events
      .slice(mark)
      .filter((event) => event.method === "Network.requestWillBeSent")
      .map((event) => event.params.redirectResponse)
      .filter((response) => response !== undefined)
      .filter((response) => new URL(response.url).pathname === path)
      .map((response) => response.status);
    return [...responses, ...redirects];
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
  await page.command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 980,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.command("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__blogAuditErrors = [];
      addEventListener("error", (event) => window.__blogAuditErrors.push(event.message));
      addEventListener("unhandledrejection", (event) => window.__blogAuditErrors.push(String(event.reason)));
    `,
  });
  return page;
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

async function submitTotp(page, submittedPassword, code) {
  await fill(page, "#admin-password", submittedPassword);
  await fill(page, "#admin-verification-code", code);
  await page.evaluate(
    "document.querySelector('form.login-form').requestSubmit()",
  );
}

async function selectRecovery(page) {
  await page.evaluate(`(() => {
    const controls = document.querySelectorAll('[name="verification-kind"]');
    if (controls.length !== 2) throw new Error('Missing verification controls');
    controls[1].click();
  })()`);
  await page.waitFor(
    "document.querySelector('label[for=admin-verification-code]')?.textContent?.trim() === '恢复码'",
    "recovery verification selection",
  );
}

async function assertPageIntegrity(page, label) {
  const facts = await page.evaluate(`(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
    errors: window.__blogAuditErrors ?? [],
  }))()`);
  assert(
    facts.contentWidth <= facts.viewportWidth,
    `${label}: no horizontal overflow`,
    facts,
  );
  assert(facts.errors.length === 0, `${label}: no page errors`, facts.errors);
  report.errors.push(...facts.errors.map((message) => ({ label, message })));
}

async function auditConfiguredServer(page) {
  const redirectMark = page.events.length;
  await page.navigate(authenticatedOrigin, "/admin/content/workspace.html");
  await page.waitFor(
    "location.pathname === '/admin/login.html' && document.querySelector('form.login-form') !== null",
    "protected page redirect",
  );
  const redirects = page.responseStatuses(
    redirectMark,
    "/admin/content/workspace.html",
  );
  assert(
    redirects.includes(302),
    "protected page: unauthenticated response is 302",
    redirects,
  );
  const loginLocation = await page.evaluate(
    "({ search: location.search, path: location.pathname })",
  );
  assert(
    new URLSearchParams(loginLocation.search).get("next") ===
      "/admin/content/workspace.html",
    "protected page: safe next is preserved",
    loginLocation.search,
  );

  const apiStatus = await page.evaluate(
    "fetch('/api/admin/content/workspace').then((response) => response.status)",
  );
  assert(
    apiStatus === 401,
    "admin API: unauthenticated response is 401",
    apiStatus,
  );

  const invalidMark = page.events.length;
  await submitTotp(page, "invalid-browser-audit", "000000");
  await page.waitFor(
    "document.querySelector('[role=alert]')?.textContent?.trim().length > 0",
    "invalid credential error",
  );
  const invalidStatuses = page.responseStatuses(
    invalidMark,
    "/api/admin/session",
  );
  assert(
    invalidStatuses.includes(401),
    "invalid credentials: browser receives 401",
    invalidStatuses,
  );
  await page.screenshot("desktop-invalid-credentials.png");

  await selectRecovery(page);
  await fill(page, "#admin-password", password);
  await fill(page, "#admin-verification-code", recoveryCode);
  await page.evaluate(
    "document.querySelector('form.login-form').requestSubmit()",
  );
  await page.waitFor(
    "location.pathname === '/admin/content/workspace.html' && document.body.innerText.includes('分类树与发布批次')",
    "successful recovery login",
  );
  assert(
    await page.evaluate("document.body.innerText.includes('退出')"),
    "successful login: authenticated navigation is visible",
  );
  await assertPageIntegrity(page, "authenticated workspace");
  await page.screenshot("desktop-authenticated-workspace.png");

  await page.evaluate("document.querySelector('button.nav-logout').click()");
  await page.waitFor(
    "location.pathname === '/admin/login.html'",
    "logout navigation",
  );
  await page.navigate(authenticatedOrigin, "/admin/content/workspace.html");
  await page.waitFor(
    "location.pathname === '/admin/login.html'",
    "post-logout protection",
  );
  const postLogoutApiStatus = await page.evaluate(
    "fetch('/api/admin/content/workspace').then((response) => response.status)",
  );
  assert(
    postLogoutApiStatus === 401,
    "logout: session is revoked for admin API",
    postLogoutApiStatus,
  );

  const rateStatuses = await page.evaluate(`(async () => {
    const statuses = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sceneCode: 'admin.session.create',
          password: 'invalid-browser-audit',
          verification: { kind: 'totp', code: '000000' },
        }),
      });
      statuses.push(response.status);
    }
    return statuses;
  })()`);
  assert(
    JSON.stringify(rateStatuses) === JSON.stringify([401, 401, 401, 401, 429]),
    "rate limit: fifth failed login returns 429",
    rateStatuses,
  );
  await submitTotp(page, "invalid-browser-audit", "000000");
  await page.waitFor(
    "document.querySelector('[role=alert]')?.textContent?.trim().length > 0",
    "rate limit error",
  );
  assert(
    await page.evaluate(
      "document.querySelector('[role=alert]').textContent.length > 0",
    ),
    "rate limit: UI presents an error",
  );
  await page.screenshot("desktop-rate-limited.png");

  report.pages.configured = {
    unauthenticatedPageStatus: 302,
    unauthenticatedApiStatus: apiStatus,
    invalidCredentialStatus: 401,
    successfulRecoveryLogin: true,
    logoutApiStatus: postLogoutApiStatus,
    rateStatuses,
  };
}

async function auditUnavailableServer(page) {
  await page.command("Network.clearBrowserCookies");
  await page.navigate(unavailableOrigin, "/admin/login.html");
  const unavailableMark = page.events.length;
  await submitTotp(page, "unavailable-browser-audit", "000000");
  await page.waitFor(
    "document.querySelector('[role=alert]')?.textContent?.trim().length > 0",
    "unavailable credential error",
  );
  const statuses = page.responseStatuses(unavailableMark, "/api/admin/session");
  assert(
    statuses.includes(503),
    "missing credentials: browser receives 503",
    statuses,
  );
  assert(
    await page.evaluate(
      "document.querySelector('[role=alert]').textContent.length > 0",
    ),
    "missing credentials: UI presents an error",
  );
  await assertPageIntegrity(page, "unavailable login");
  await page.screenshot("desktop-auth-unavailable.png");
  report.pages.unavailable = { loginStatus: 503 };
}

let page;
try {
  page = await createPage();
  await auditConfiguredServer(page);
  await auditUnavailableServer(page);
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
