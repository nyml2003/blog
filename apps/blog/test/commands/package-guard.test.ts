import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPackageNeutrality } from '../../src/quality/package-guard.ts';

function guard(entries: Record<string, string>): ReturnType<typeof checkPackageNeutrality> {
  const sources = new Map(Object.entries(entries));
  return checkPackageNeutrality([...sources.keys()], (file) => sources.get(file) ?? '');
}

test('ts domain: relative and same-scope imports pass, platform globals rejected', () => {
  assert.deepEqual(guard({
    '/ws/packages/ts/query/src/task.ts':
      'import { ok } from "@fluvient/core";\nimport type { NetworkPort } from "@fluvient-loom/port";\nimport type { DataTask } from "./ports/task.ts";',
    '/ws/packages/ts/core/src/result.ts': 'export type A = 1;',
  }), []);
  const violations = guard({
    '/ws/packages/ts/net/src/network.ts': 'const x = window.fetch;',
  });
  assert.equal(violations.length, 1);
  assert.ok(violations[0].message.includes('平台全局'));
});

test('ts/web domain: node builtins and bare specifiers are violations (scope subpaths pass)', () => {
  for (const domain of ['ts', 'web']) {
    const violations = guard({
      [`/ws/packages/${domain}/x/src/a.ts`]: 'import assert from "node:assert/strict";',
      [`/ws/packages/${domain}/x/src/b.ts`]: 'import { createSignal } from "solid-js";',
      [`/ws/packages/${domain}/x/src/c.ts`]: 'import type { PersistencePort } from "@fluvient-loom/port";',
    });
    assert.equal(violations.length, 2, domain);
    assert.ok(violations.every((v) => v.message.includes('非中立依赖')));
  }
});

test('web domain: platform globals allowed (host adapters by nature)', () => {
  assert.deepEqual(guard({
    '/ws/packages/web/web/src/navigation.ts':
      'import { createWebNavigation } from "@fluvient-loom/port";\nconst h = window.history;',
  }), []);
});

test('solid domain: solid-js allowed alongside scope imports and platform globals', () => {
  assert.deepEqual(guard({
    '/ws/packages/solid/persisted-state/src/persisted-record.ts':
      'import { createSignal } from "solid-js";\nconst s = window.localStorage;',
  }), []);
  const violations = guard({
    '/ws/packages/solid/atoms/src/a.ts': 'import { createSignal } from "solid-js";\nimport fs from "node:fs";',
  });
  assert.equal(violations.length, 1);
  assert.ok(violations[0].message.includes('node:fs'));
});

test('cli and app domains are skipped by design', () => {
  assert.deepEqual(guard({
    '/ws/packages/cli/cli-kit/src/process.ts': 'import { spawn } from "node:child_process";\nconst g = globalThis;',
    '/ws/packages/cli/node/src/scheduler.ts': 'import { setTimeout } from "node:timers";',
    '/ws/packages/app/desktop-shared/src/search.ts': 'import { z } from "zod";\nimport { createSignal } from "solid-js";',
    '/ws/packages/app/pages/desktop-detail/src/page.tsx': 'import { ArrowLeft } from "lucide-solid";',
  }), []);
});

test('build domain: vite and node imports allowed, platform globals rejected', () => {
  assert.deepEqual(guard({
    '/ws/packages/build/page-build-kit/src/plugins/page-template.ts':
      'import { existsSync } from "node:fs";\nimport type { Plugin } from "vite";\nimport { renderAppShell } from "@fluvient-loom/app-shell";',
  }), []);
  const violations = guard({
    '/ws/packages/build/page-build-kit/src/x.ts': 'const w = window.location;',
  });
  assert.equal(violations.length, 1);
  assert.ok(violations[0].message.includes('平台全局'));
});

test('unknown category fails closed (placement is the policy)', () => {
  const violations = guard({
    '/ws/packages/loose/x/src/a.ts': 'export const a = 1;',
  });
  assert.equal(violations.length, 1);
  assert.ok(violations[0].message.includes('未知包类别'));
});
