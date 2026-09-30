import { createDataTask } from "@fluvient-loom/query";
import { type CancellationSignal } from "@fluvient-loom/common";
import { parseHtmlInspection, type HtmlInspection } from "./article-html";

export type HtmlInspectionFailure =
  | { readonly kind: "cancelled" }
  | { readonly kind: "protocol"; readonly message: string };
type InspectModule = { inspect_html(source: string): string };

async function loadWasm(): Promise<InspectModule> {
  const module = await import("./generated/article_html_wasm.js");
  await module.default();
  return module;
}

export function createHtmlInspector(load: () => Promise<InspectModule>) {
  let pending: Promise<InspectModule> | undefined;
  const initialize = () => {
    if (pending) return pending;
    pending = load().catch((cause: unknown) => {
      pending = undefined;
      throw cause;
    });
    return pending;
  };
  return (source: string) =>
    createDataTask<HtmlInspection, HtmlInspectionFailure>({
      async execute(signal: CancellationSignal) {
        try {
          const module = await initialize();
          if (signal.cancelled)
            return { ok: false, error: { kind: "cancelled" as const } };
          const inspection = parseHtmlInspection(
            JSON.parse(module.inspect_html(source)),
          );
          if (signal.cancelled)
            return { ok: false, error: { kind: "cancelled" as const } };
          return { ok: true, value: inspection };
        } catch (cause) {
          if (signal.cancelled)
            return { ok: false, error: { kind: "cancelled" as const } };
          return {
            ok: false,
            error: {
              kind: "protocol" as const,
              message:
                cause instanceof Error
                  ? `HTML 校验不可用：${cause.message}`
                  : "HTML 校验不可用",
            },
          };
        }
      },
      mapRejected(cause) {
        return {
          kind: "protocol",
          message: cause instanceof Error ? cause.message : "HTML 校验不可用",
        };
      },
    });
}

export const inspectHtml = createHtmlInspector(loadWasm);
