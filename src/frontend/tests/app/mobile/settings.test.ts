import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryAsyncPersistence,
  createMemoryPersistence,
} from "@fluvient-loom/node";
import {
  createMobileSettingsCommand,
  createMobileSettingsReadTask,
  mobileSettingsKeys,
  readMobileSettings,
  readMobileSettingsAsync,
} from "../../../app/habitat/mobile/logic/settings";

test("settings query migrates legacy keys into one snapshot", async () => {
  const persistence = createMemoryAsyncPersistence({
    [mobileSettingsKeys.theme]: "dark",
    [mobileSettingsKeys.font]: "mono",
  });
  const result = await readMobileSettingsAsync(persistence);
  assert.deepEqual(result, {
    ok: true,
    value: { theme: "dark", font: "mono" },
  });
  const query = await createMobileSettingsReadTask(persistence).start();
  assert.deepEqual(query, {
    ok: true,
    value: { theme: "dark", font: "mono" },
  });
});

test("synchronous first paint prefers the authoritative snapshot", () => {
  const persistence = createMemoryPersistence({
    [mobileSettingsKeys.snapshot]: JSON.stringify({
      theme: "sepia",
      font: "serif",
    }),
    [mobileSettingsKeys.theme]: "dark",
    [mobileSettingsKeys.font]: "mono",
  });
  assert.deepEqual(readMobileSettings(persistence), {
    theme: "sepia",
    font: "serif",
  });
});

test("settings command writes a complete snapshot and compensates it", async () => {
  const persistence = createMemoryAsyncPersistence();
  const command = createMobileSettingsCommand(persistence);
  const prepared = await command.prepare(
    {
      previous: { theme: "paper", font: "sans" },
      next: { theme: "dark", font: "mono" },
      changes: { theme: "dark", font: "mono" },
    },
    { operationId: "op-1", sequence: 1 },
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(await prepared.value.execute(), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await readMobileSettingsAsync(persistence), {
    ok: true,
    value: { theme: "dark", font: "mono" },
  });
  assert.deepEqual(await prepared.value.compensate(), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await readMobileSettingsAsync(persistence), {
    ok: true,
    value: { theme: "paper", font: "sans" },
  });
});

test("settings query returns a failure when the async storage read fails", async () => {
  const persistence = createMemoryAsyncPersistence();
  const failing = {
    ...persistence,
    read: async () => ({
      ok: false as const,
      error: {
        kind: "persistence" as const,
        operation: "read" as const,
        message: "blocked",
      },
    }),
  };
  const result = await readMobileSettingsAsync(failing);
  assert.deepEqual(result, {
    ok: false,
    error: { kind: "settings", message: "blocked" },
  });
});
