import { For, Show } from "solid-js";
import type { QueryReadonly as DeepReadonly } from "../../../../solid/queries";
import type {
  HtmlDiagnostic,
  HtmlInspection,
} from "../../../../common/validation/article-html";

export function HtmlDiagnostics(props: {
  id?: string;
  inspection: DeepReadonly<HtmlInspection> | undefined;
  pending: boolean;
  error: string;
  retry: () => void;
  locate: ((diagnostic: DeepReadonly<HtmlDiagnostic>) => void) | undefined;
}) {
  return (
    <div
      id={props.id ?? "html-diagnostics"}
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
