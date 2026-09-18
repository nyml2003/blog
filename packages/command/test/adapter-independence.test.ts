import assert from "node:assert/strict";
import test from "node:test";
import { err, ok } from "@fluvient-loom/common";
import type {
  DocumentPort,
  OperationIdPort,
  PersistencePort,
  PreparedCommand,
  ReversibleCommand,
  SchedulerPort,
} from "@fluvient-loom/port";
import { createDataTask } from "@fluvient-loom/query";
import {
  createPersistentDesiredState,
  type PersistentDesiredState,
} from "@fluvient-loom/command";
import {
  createMemoryPersistence,
  createNodeOperationId,
  createNodeScheduler,
} from "@fluvient-loom/node";
import {
  createWebDocument,
  createWebPersistence,
  createWebScheduler,
} from "@fluvient-loom/web";

interface Settings {
  readonly theme: string;
  readonly font: string;
}

const DEFAULT: Settings = { theme: "paper", font: "sans" };
const KEY = "fluvient.lifecycle";

const parse = (raw: string | undefined): Settings => {
  if (raw === undefined) return DEFAULT;
  const parsed = JSON.parse(raw) as Partial<Settings>;
  return {
    theme: parsed.theme ?? DEFAULT.theme,
    font: parsed.font ?? DEFAULT.font,
  };
};

/** Adapter-agnostic wiring: the factory only ever sees ports. */
function assemble(input: {
  readonly persistence: PersistencePort;
  readonly scheduler: SchedulerPort;
  readonly operationIds: OperationIdPort;
  readonly document?: DocumentPort;
  readonly projected: Settings[];
}): PersistentDesiredState<Settings, Error> {
  return createPersistentDesiredState<Settings, Error>({
    disposedError: new Error("disposed"),
    persistence: input.persistence,
    restore: (persistence) => {
      const read = persistence.read(KEY);
      return parse(read.ok ? read.value : undefined);
    },
    reconcileTask: () =>
      createDataTask({
        execute: async () => {
          const read = input.persistence.read(KEY);
          return ok(parse(read.ok ? read.value : undefined));
        },
        mapRejected: (cause) => new Error(String(cause)),
      }),
    scheduler: input.scheduler,
    operationIds: input.operationIds,
    command: {
      kind: "atomic",
      async prepare(input2) {
        return ok({
          async execute() {
            const written = input.persistence.write(
              KEY,
              JSON.stringify(input2.next),
            );
            return written.ok ? ok(undefined) : err(new Error("write failed"));
          },
          async compensate() {
            return ok(undefined);
          },
        } satisfies PreparedCommand<Error>);
      },
    } satisfies ReversibleCommand<
      { previous: Settings; next: Settings; changes: Partial<Settings> },
      Error
    >,
    project: (value) => {
      input.projected.push(value);
      input.document?.writeRootAttribute("data-theme", value.theme);
      input.document?.writeRootAttribute("data-font", value.font);
    },
  });
}

/** The script both hosts must pass through identically. */
async function runScript(
  state: PersistentDesiredState<Settings, Error>,
  projected: Settings[],
  seed: () => void,
): Promise<Settings[]> {
  assert.deepEqual(projected[0], DEFAULT, "restore projects synchronously");
  seed();
  const reconciled = await state.reconcile();
  assert.equal(reconciled.ok, true);
  assert.deepEqual(projected.at(-1), { theme: "dark", font: "sans" });
  const updated = await state.update({ font: "serif" });
  assert.deepEqual(updated, { ok: true, value: undefined });
  assert.deepEqual(projected.at(-1), { theme: "dark", font: "serif" });
  return projected;
}

test("the same factory and script produce identical projections on the Node adapter", async () => {
  const persistence = createMemoryPersistence();
  const projected: Settings[] = [];
  const state = assemble({
    persistence,
    scheduler: createNodeScheduler(),
    operationIds: createNodeOperationId(),
    projected,
  });
  await runScript(state, projected, () =>
    persistence.write(KEY, JSON.stringify({ theme: "dark", font: "sans" })),
  );
});

test("the same factory and script produce identical projections on the web adapter", async () => {
  const storage = new Map<string, string>();
  const persistence = createWebPersistence({
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  const projected: Settings[] = [];
  const state = assemble({
    persistence,
    scheduler: createWebScheduler(),
    operationIds: createNodeOperationId(),
    projected,
  });
  await runScript(state, projected, () =>
    storage.set(KEY, JSON.stringify({ theme: "dark", font: "sans" })),
  );
});

test("adapters are interchangeable: both runs share one projection sequence", async () => {
  const run = async () => {
    const persistence = createMemoryPersistence();
    const projected: Settings[] = [];
    const state = assemble({
      persistence,
      scheduler: createNodeScheduler(),
      operationIds: createNodeOperationId(),
      projected,
    });
    return runScript(state, projected, () =>
      persistence.write(KEY, JSON.stringify({ theme: "dark", font: "sans" })),
    );
  };
  const webRun = async () => {
    const storage = new Map<string, string>();
    const projected: Settings[] = [];
    const state = assemble({
      persistence: createWebPersistence({
        storage: {
          getItem: (key) => storage.get(key) ?? null,
          setItem: (key, value) => storage.set(key, value),
          removeItem: (key) => storage.delete(key),
        },
      }),
      scheduler: createWebScheduler(),
      operationIds: createNodeOperationId(),
      projected,
    });
    return runScript(state, projected, () =>
      storage.set(KEY, JSON.stringify({ theme: "dark", font: "sans" })),
    );
  };
  assert.deepEqual(await run(), await webRun());
});

test("web wiring projects the lifecycle onto root attributes", async () => {
  const attributes = new Map<string, string>();
  const document = createWebDocument({
    root: {
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, value),
    },
  });
  const persistence = createMemoryPersistence();
  const projected: Settings[] = [];
  const state = assemble({
    persistence,
    scheduler: createNodeScheduler(),
    operationIds: createNodeOperationId(),
    document,
    projected,
  });
  persistence.write(KEY, JSON.stringify({ theme: "dark", font: "sans" }));
  await state.reconcile();
  await state.update({ font: "serif" });
  assert.equal(attributes.get("data-theme"), "dark");
  assert.equal(attributes.get("data-font"), "serif");
});
