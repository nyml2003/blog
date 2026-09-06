import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  applySettings,
  isMobileFont,
  isMobileTheme,
  mobileSettingsKeys,
  persistFont,
  persistTheme,
  readAppliedSettings,
  readStoredSettings,
} from "./settings";

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

test("the synchronous head bootstrap agrees with module validation and fallback", () => {
  const html = readFileSync(
    new URL("../../pages/settings/index.html", import.meta.url),
    "utf8",
  );
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "The head must contain a synchronous inline script");
  assert.ok(html.indexOf("<script>") < html.indexOf("</head>"));
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
        assert.equal(root.getAttribute("data-theme"), null);
      if (!isMobileFont(font))
        assert.equal(root.getAttribute("data-font"), null);
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
