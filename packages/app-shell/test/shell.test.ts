import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderAppShell, type AppShellSpec } from "@fluvient-loom/app-shell";

const SPEC: AppShellSpec = {
  id: "mobile-home-shell",
  platform: "mobile",
  loadingLabel: "正在加载首页",
  shimmerDelayMs: 240,
  regions: [
    {
      id: "header",
      role: "banner",
      blockSize: "68px",
      placeholders: [],
    },
    {
      id: "content",
      role: "main",
      blockSize: "480px",
      placeholders: [
        { kind: "media", blockSize: "180px", aspectRatio: 16 / 9 },
        { kind: "line", blockSize: "22px", inlineSize: "86%" },
      ],
    },
  ],
};

test("renders deterministic shell HTML and geometry CSS", () => {
  const rendered = renderAppShell(SPEC);

  assert.equal(
    rendered.html,
    '<div id="mobile-home-shell" class="loom-app-shell loom-app-shell--mobile" data-loom-app-shell="true" aria-hidden="true"><span class="loom-app-shell__status">正在加载首页</span><section class="loom-app-shell__region" data-loom-shell-region="header" data-loom-shell-region-index="0" role="banner"></section><section class="loom-app-shell__region" data-loom-shell-region="content" data-loom-shell-region-index="1" role="main"><div class="loom-app-shell__placeholder loom-app-shell__placeholder--media" data-loom-shell-placeholder="1-0" aria-hidden="true"></div><div class="loom-app-shell__placeholder loom-app-shell__placeholder--line" data-loom-shell-placeholder="1-1" aria-hidden="true"></div></section></div>',
  );
  assert.equal(
    rendered.criticalCss,
    '.loom-app-shell--mobile{--loom-shell-shimmer-delay:240ms;}.loom-app-shell--mobile [data-loom-shell-region-index="0"]{min-block-size:68px;}.loom-app-shell--mobile [data-loom-shell-region-index="1"]{min-block-size:480px;}.loom-app-shell--mobile [data-loom-shell-placeholder="1-0"]{block-size:180px;aspect-ratio:1.7777777777777777;}.loom-app-shell--mobile [data-loom-shell-placeholder="1-1"]{block-size:22px;inline-size:86%;}',
  );
});

test("escapes labels and region identifiers without changing CSS selectors", () => {
  const rendered = renderAppShell({
    ...SPEC,
    id: "shell&1",
    loadingLabel: '<等待>',
    regions: [
      {
        ...SPEC.regions[0],
        id: 'header"&',
      },
    ],
  });

  assert.match(rendered.html, /id="shell&amp;1"/);
  assert.match(rendered.html, /正在|&lt;等待&gt;/);
  assert.match(rendered.html, /data-loom-shell-region="header&quot;&amp;"/);
  assert.doesNotMatch(rendered.criticalCss, /header/);
});

test("rejects invalid geometry and duplicate region identifiers", () => {
  assert.throws(
    () =>
      renderAppShell({
        ...SPEC,
        regions: [{ ...SPEC.regions[0], blockSize: "68px; color:red" }],
      }),
    /CSS value/,
  );
  assert.throws(
    () =>
      renderAppShell({
        ...SPEC,
        regions: [SPEC.regions[0], SPEC.regions[0]],
      }),
    /must be unique/,
  );
});

test("static styles delay shimmer and honor reduced motion", () => {
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  assert.match(styles, /animation-delay: var\(--loom-shell-shimmer-delay, 200ms\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation: none/);
});
