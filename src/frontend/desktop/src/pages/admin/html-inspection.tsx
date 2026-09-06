import { For, Show, type Accessor } from "solid-js";
import { browserClient as client } from "../../../../common/client";
import type { DeepReadonly } from "../../../../common/data/readonly";
import type {
  HtmlDiagnostic,
  HtmlInspection,
} from "../../../../common/validation/article-html";
import { useDataResource } from "../../../../solid/data";
import { createDataTask } from "../../../../common/data/task";

export function useHtmlInspection(source: Accessor<string>) {
  const resource = useDataResource(source, (html) =>
    createDataTask(async (signal) => {
      const inspection = client.draftEditor.inspectHtml(html);
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

export function HtmlDiagnostics(props: {
  inspection: DeepReadonly<HtmlInspection> | undefined;
  pending: boolean;
  error: string;
  retry: () => void;
  locate: ((diagnostic: DeepReadonly<HtmlDiagnostic>) => void) | undefined;
}) {
  return (
    <div
      id="html-diagnostics"
      class="html-diagnostics"
      aria-live="polite"
      aria-atomic="true"
    >
      <Show when={props.pending}>
        <p role="status">正在校验正文...</p>
      </Show>
      <Show when={props.error}>
        <p class="error">{props.error}</p>
        <button type="button" onClick={props.retry}>
          重新校验
        </button>
      </Show>
      <Show when={props.inspection}>
        {(inspection) => (
          <>
            <p class={inspection().valid ? "status-published" : "status-draft"}>
              {inspection().valid ? "正文校验通过" : "正文校验未通过"}
            </p>
            <ul>
              <For each={inspection().diagnostics}>
                {(diagnostic) => (
                  <li>
                    <Show
                      when={props.locate}
                      fallback={
                        <span>
                          第 {diagnostic.span.start.line} 行，第{" "}
                          {diagnostic.span.start.column} 列
                        </span>
                      }
                    >
                      {(locate) => (
                        <button
                          type="button"
                          class="diagnostic-location"
                          onClick={() => locate()(diagnostic)}
                        >
                          第 {diagnostic.span.start.line} 行，第{" "}
                          {diagnostic.span.start.column} 列
                        </button>
                      )}
                    </Show>
                    <span>{diagnostic.message}</span>
                    <code>{diagnostic.code}</code>
                  </li>
                )}
              </For>
            </ul>
          </>
        )}
      </Show>
    </div>
  );
}
