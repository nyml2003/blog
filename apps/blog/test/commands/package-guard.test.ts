import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPackageNeutrality } from '../../src/quality/package-guard.ts';

function guard(entries: Record<string, string>): ReturnType<typeof checkPackageNeutrality> {
  const sources = new Map(Object.entries(entries));
  return checkPackageNeutrality([...sources.keys()], (file) => sources.get(file) ?? '');
}

test('relative and same-scope imports pass with no platform globals', () => {
  const violations = guard({
    '/ws/packages/query/src/task.ts':
      'import { ok } from "@fluvient/core";\nimport type { DataTask } from "./ports/task.ts";\nexport const x = 1;',
    '/ws/packages/core/src/result.ts': 'export type A = 1;',
  });
  assert.deepEqual(violations, []);
});

test('node builtins, bare specifiers, and absolute imports are violations', () => {
  const violations = guard({
    '/ws/packages/command/src/a.ts': 'import assert from "node:assert/strict";',
    '/ws/packages/command/src/b.ts': 'import { createSignal } from "solid-js";',
    '/ws/packages/command/src/c.ts': 'import x from "/abs/path.ts";',
  });
  assert.equal(violations.length, 3);
  assert.ok(violations.every((v) => v.message.includes('非中立依赖')));
});

test('platform global member access is a violation', () => {
  const violations = guard({
    '/ws/packages/port/src/a.ts': 'document.documentElement.setAttribute("a", "b");',
    '/ws/packages/port/src/b.ts': 'const x = window.innerWidth;',
  });
  assert.equal(violations.length, 2);
  assert.ok(violations.every((v) => v.message.includes('平台全局访问')));
});

test('files outside packages/*/src are ignored', () => {
  const violations = guard({
    '/ws/packages/command/test/a.test.ts': 'import test from "node:test";',
    '/ws/apps/blog/test/packages/package-smoke.ts': 'import assert from "node:assert/strict";',
    '/ws/src/frontend/app/kernel/task.ts': 'import { ok } from "./result";',
  });
  assert.deepEqual(violations, []);
});

test('host adapter packages may touch platform globals but not node imports', () => {
  const violations = guard({
    '/ws/packages/web/src/document.ts':
      'const root = typeof document === "undefined" ? undefined : document.documentElement;',
    '/ws/packages/gesture-web/src/scroll-view.ts':
      'body.addEventListener("touchmove", (event) => event.preventDefault());',
    '/ws/packages/web/src/bad.ts': 'import fs from "node:fs";',
    '/ws/packages/gesture-web/src/bad.ts': 'import fs from "node:fs";',
  });
  assert.equal(violations.length, 2);
  assert.ok(violations.every((v) => v.message.includes('非中立依赖')));
});

test('non-kernel packages use their explicit platform/framework exceptions', () => {
  const violations = guard({
    '/ws/packages/cli-core/src/process.ts': 'import { spawn } from "node:child_process";',
    '/ws/packages/cli-kit/src/workspace.ts': 'import { join } from "node:path";',
    '/ws/packages/mobile-prefetch/src/client.ts':
      'const binding = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;',
    '/ws/packages/mobile-h5-solid-atoms/src/define.ts':
      'import { mergeProps } from "solid-js";',
    '/ws/packages/persisted-state/src/persisted-record.ts':
      'import { createSignal } from "solid-js";',
  });
  assert.deepEqual(violations, []);
});
