/**
 * Workspace smoke: proves the @fluvient-loom packages are consumable from a
 * plain Node context — the lifecycle factory assembled with the real Node
 * adapter, every path flowing through the single project hook.
 */
import assert from "node:assert/strict";
import { ok } from "@fluvient-loom/common";
import type {
  PreparedCommand,
  ReversibleCommand,
} from "@fluvient-loom/port";
import { createDataTask } from "@fluvient-loom/query";
import {
  createMemoryPersistence,
  createNodeOperationId,
  createNodeScheduler,
} from "@fluvient-loom/node";
import { createPersistentDesiredState } from "@fluvient-loom/command";

interface Settings {
  readonly theme: string;
  readonly font: string;
}

const DEFAULT: Settings = { theme: "paper", font: "sans" };
const KEY = "fluvient-loom.smoke";

const persistence = createMemoryPersistence();
const scheduler = createNodeScheduler();
const operationIds = createNodeOperationId();

const parse = (raw: string | undefined): Settings => {
  if (raw === undefined) return DEFAULT;
  const parsed = JSON.parse(raw) as Partial<Settings>;
  return {
    theme: parsed.theme ?? DEFAULT.theme,
    font: parsed.font ?? DEFAULT.font,
  };
};

const readRaw = (key: string): string | undefined => {
  const read = persistence.read(key);
  return read.ok ? read.value : undefined;
};

const projected: Settings[] = [];

const command: ReversibleCommand<
  { previous: Settings; next: Settings; changes: Partial<Settings> },
  Error
> = {
  kind: "atomic",
  async prepare(input) {
    return ok({
      async execute() {
        persistence.write(KEY, JSON.stringify(input.next));
        return ok(undefined);
      },
      async compensate() {
        return ok(undefined);
      },
    } satisfies PreparedCommand<Error>);
  },
};

const state = createPersistentDesiredState<Settings, Error>({
  disposedError: new Error("disposed"),
  persistence,
  restore: (port) => {
    const read = port.read(KEY);
    return parse(read.ok ? read.value : undefined);
  },
  reconcileTask: () =>
    createDataTask({
      execute: async () => ok(parse(readRaw(KEY))),
      mapRejected: (cause) => new Error(String(cause)),
    }),
  scheduler,
  operationIds,
  command,
  project: (value) => projected.push(value),
});

// 1. restore projected synchronously at creation
assert.deepEqual(projected[0], DEFAULT);

// 2. reconcile projects the stored truth
persistence.write(KEY, JSON.stringify({ theme: "dark", font: "sans" }));
const reconciled = await state.reconcile();
assert.equal(reconciled.ok, true);
assert.deepEqual(projected.at(-1), { theme: "dark", font: "sans" });

// 3./4. optimistic update settles through the same hook under real scheduling
const written = await state.update({ font: "serif" });
assert.deepEqual(written, { ok: true, value: undefined });
assert.deepEqual(projected.at(-1), { theme: "dark", font: "serif" });
assert.deepEqual(
  parse(readRaw(KEY)),
  { theme: "dark", font: "serif" },
  "command wrote the settled value through the Node persistence adapter",
);

state.dispose();
console.log(
  "package smoke: lifecycle factory + real Node adapter, all paths projected through one hook ✓",
);
