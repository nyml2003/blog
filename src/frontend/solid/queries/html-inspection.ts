import type { Accessor } from "solid-js";
import { createDataTask } from "../../common/data/task";
import { queryClient, useDataResource } from "./core";

const htmlInspectionDebounceMs = 260;

export function waitForHtmlInspectionDebounce(
  signal: AbortSignal,
  delayMs: number,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      resolve(ready);
    };
    const timer = setTimeout(() => finish(true), delayMs);
    const abort = () => {
      clearTimeout(timer);
      finish(false);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function useHtmlInspection(source: Accessor<string>) {
  const resource = useDataResource(source, (html) =>
    createDataTask(async (signal) => {
      const ready = await waitForHtmlInspectionDebounce(
        signal,
        htmlInspectionDebounceMs,
      );
      if (!ready) return { ok: false, error: { kind: "cancelled" as const } };
      const inspection = queryClient.draftEditor.inspectHtml(html);
      const cancel = () => inspection.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const result = await inspection.start();
        if (!result.ok) return result;
        return { ok: true, value: { source: html, inspection: result.value } };
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    }),
  );
  const current = () => {
    const snapshot = resource.snapshot();
    if (snapshot?.source !== source()) return undefined;
    return snapshot.inspection;
  };
  return { resource, current, valid: () => current()?.valid === true };
}
