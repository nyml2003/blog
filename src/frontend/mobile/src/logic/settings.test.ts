import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { mobileSettingsBootstrap } from "../../../build/mobile-settings-bootstrap";
import {
  createMobileSettingsClient,
  isMobileFont,
  isMobileTheme,
  mobileSettingsKeys,
  type MobileFont,
  type MobileTheme,
} from "../../../common/client/mobile-settings";
import {
  createSynchronousStorage,
  type StorageProvider,
} from "../../../common/data/storage";
import { applySettings, readAppliedSettings } from "./settings";

// Existing scenarios retain their inputs while storage ownership moves to Client.
function readStoredSettings(provider: StorageProvider) {
  return createMobileSettingsClient(createSynchronousStorage(provider)).read();
}

function persistFont(provider: StorageProvider, font: MobileFont) {
  return createMobileSettingsClient(createSynchronousStorage(provider)).saveFont(
    font,
  );
}

function persistTheme(provider: StorageProvider, theme: MobileTheme) {
  return createMobileSettingsClient(createSynchronousStorage(provider)).saveTheme(
    theme,
  );
}

function createStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  const writes: [string, string][] = [];
  return {
    writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) {
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}

function createRoot() {
  const attributes = new Map<string, string>();
  return {
    getAttribute: (key: string) => attributes.get(key) ?? null,
    setAttribute: (key: string, value: string) => attributes.set(key, value),
  };
}

test("only frozen theme and font values are accepted", () => {
  for (const theme of ["paper", "dark", "sepia"])
    assert.ok(isMobileTheme(theme));
  for (const font of ["sans", "serif", "mono"]) assert.ok(isMobileFont(font));
  for (const invalid of [
    undefined,
    null,
    "",
    "DARK",
    "system",
    "neon",
    1,
    {},
  ]) {
    assert.equal(isMobileTheme(invalid), false);
    assert.equal(isMobileFont(invalid), false);
  }
});

test("missing and invalid storage values fall back independently without writes", () => {
  const missingOrInvalid: Record<string, string>[] = [
    {},
    { [mobileSettingsKeys.theme]: "neon", [mobileSettingsKeys.font]: "comic" },
  ];
  for (const initial of missingOrInvalid) {
    const storage = createStorage(initial);
    assert.deepEqual(
      readStoredSettings(() => storage),
      {
        theme: "paper",
        font: "sans",
      },
    );
    assert.deepEqual(storage.writes, []);
  }
  const storage = createStorage({
    [mobileSettingsKeys.theme]: "neon",
    [mobileSettingsKeys.font]: "serif",
  });
  assert.deepEqual(
    readStoredSettings(() => storage),
    {
      theme: "paper",
      font: "serif",
    },
  );
});

test("each legal combination persists and applies immediately", () => {
  const themes = ["paper", "dark", "sepia"] as const;
  const fonts = ["sans", "serif", "mono"] as const;
  for (const theme of themes) {
    for (const font of fonts) {
      const storage = createStorage({});
      const root = createRoot();
      applySettings(root, { theme, font });
      persistTheme(() => storage, theme);
      persistFont(() => storage, font);
      assert.deepEqual(readAppliedSettings(root), { theme, font });
      assert.deepEqual(
        readStoredSettings(() => storage),
        { theme, font },
      );
      assert.deepEqual(storage.writes, [
        [mobileSettingsKeys.theme, theme],
        [mobileSettingsKeys.font, font],
      ]);
    }
  }
});

test("storage getter, reads and writes can fail without preventing in-memory settings", () => {
  const unavailable = () => {
    throw new Error("Storage unavailable");
  };
  const brokenStorage = { getItem: unavailable, setItem: unavailable };
  for (const storage of [unavailable, () => brokenStorage]) {
    assert.deepEqual(readStoredSettings(storage), {
      theme: "paper",
      font: "sans",
    });
    const root = createRoot();
    applySettings(root, { theme: "dark", font: "mono" });
    assert.doesNotThrow(() => persistTheme(storage, "dark"));
    assert.doesNotThrow(() => persistFont(storage, "mono"));
    assert.deepEqual(readAppliedSettings(root), {
      theme: "dark",
      font: "mono",
    });
  }
});

test("a failed theme read does not discard a readable font preference", () => {
  const storage = {
    getItem(key: string) {
      if (key === mobileSettingsKeys.theme)
        throw new Error("Blocked theme key");
      return "serif";
    },
    setItem: () => undefined,
  };
  assert.deepEqual(
    readStoredSettings(() => storage),
    { theme: "paper", font: "serif" },
  );
});

test("a blocked head bootstrap leaves the page on its default selection", () => {
  assert.deepEqual(readAppliedSettings(createRoot()), {
    theme: "paper",
    font: "sans",
  });
});

test("the synchronous head bootstrap agrees with module validation and fallback", async () => {
  const filename = fileURLToPath(
    new URL("../../pages/settings/index.html", import.meta.url),
  );
  const html = readFileSync(
    filename,
    "utf8",
  );
  const frontendRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const plugin = mobileSettingsBootstrap(frontendRoot);
  const transform = plugin.transformIndexHtml;
  assert.ok(transform && typeof transform === "object" && "handler" in transform);
  const transformed = await transform.handler(html, {
    path: "/m/settings/index.html",
    filename,
  });
  assert.ok(Array.isArray(transformed));
  const scriptTag = transformed.find((tag) => tag.tag === "script");
  assert.ok(scriptTag && typeof scriptTag.children === "string");
  assert.equal(scriptTag.injectTo, "head");
  assert.equal(scriptTag.attrs?.type, undefined);
  const script = scriptTag.children;
  const themeValues = [undefined, "paper", "dark", "sepia", "neon", "DARK", ""];
  const fontValues = [undefined, "sans", "serif", "mono", "comic", "SERIF", ""];
  for (const theme of themeValues) {
    for (const font of fontValues) {
      const initial: Record<string, string> = {};
      if (theme !== undefined) initial[mobileSettingsKeys.theme] = theme;
      if (font !== undefined) initial[mobileSettingsKeys.font] = font;
      const storage = createStorage(initial);
      const root = createRoot();
      runInNewContext(script, {
        document: { documentElement: root },
        window: { localStorage: storage },
      });
      assert.deepEqual(
        readAppliedSettings(root),
        readStoredSettings(() => storage),
      );
      if (!isMobileTheme(theme))
        assert.equal(root.getAttribute("data-theme"), "paper");
      if (!isMobileFont(font))
        assert.equal(root.getAttribute("data-font"), "sans");
      assert.deepEqual(storage.writes, []);
    }
  }
  const root = createRoot();
  const blockedWindow = {
    get localStorage() {
      throw new Error("SecurityError");
    },
  };
  assert.doesNotThrow(() =>
    runInNewContext(script, {
      document: { documentElement: root },
      window: blockedWindow,
    }),
  );
  assert.deepEqual(readAppliedSettings(root), { theme: "paper", font: "sans" });
});

test("the synchronous head bootstrap is present on every mobile page", async () => {
  const frontendRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const plugin = mobileSettingsBootstrap(frontendRoot);
  const transform = plugin.transformIndexHtml;
  assert.ok(transform && typeof transform === "object" && "handler" in transform);

  for (const page of [
    "home/index.html",
    "articles/index.html",
    "article-detail/index.html",
    "settings/index.html",
  ]) {
    const filename = fileURLToPath(
      new URL(`../../pages/${page}`, import.meta.url),
    );
    const transformed = await transform.handler(readFileSync(filename, "utf8"), {
      path: `/m/${page}`,
      filename,
    });
    const scriptTag = transformed?.find((tag) => tag.tag === "script");
    assert.ok(scriptTag && typeof scriptTag.children === "string");
  }
});
