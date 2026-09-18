import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot, createSignal } from "solid-js";
import { createDataTask } from "../../../common/data/task";
import { useDataResource } from "../../../solid/data/use-data-resource";

const tick = async () => {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

test("useDataResource starts, exposes snapshots, and refetches", async () => {
  const result = createRoot((dispose) => {
    const [input] = createSignal("one");
    let calls = 0;
    const resource = useDataResource(input, (value) =>
      createDataTask(async () => ({ ok: true, value: `${value}-${++calls}` })),
    );
    return { resource, dispose };
  });
  await tick();
  assert.equal(result.resource.status(), "success");
  assert.equal(result.resource.snapshot(), "one-1");
  await result.resource.refetch();
  assert.equal(result.resource.snapshot(), "one-2");
  result.dispose();
});

test("useDataResource cancels its active resource", async () => {
  const result = createRoot((dispose) => {
    const [input] = createSignal("one");
    const cancelled: string[] = [];
    const resource = useDataResource(input, (value) =>
      createDataTask(
        (signal) =>
          new Promise<{ ok: false; error: { kind: "cancelled" } }>(
            (resolve) => {
              signal.addEventListener(
                "abort",
                () => {
                  cancelled.push(value);
                  resolve({ ok: false, error: { kind: "cancelled" } });
                },
                { once: true },
              );
            },
          ),
      ),
    );
    return { resource, cancelled, dispose };
  });
  await tick();
  result.resource.cancel();
  result.dispose();
  assert.deepEqual(result.cancelled, ["one"]);
});
