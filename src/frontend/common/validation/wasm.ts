import { cancelled, type DataError } from "../data/errors";
import { err, ok } from "../data/result";
import { createDataTask, type DataTask } from "../data/task";
import { parseHtmlInspection, type HtmlInspection } from "./article-html";

type InspectModule = { inspect_html(source: string): string };
type LoadModule = () => Promise<InspectModule>;

async function loadWasm(): Promise<InspectModule> {
  const module = await import("./generated/article_html_wasm.js");
  await module.default();
  return module;
}

export function createHtmlInspector(load: LoadModule) {
  let pending: Promise<InspectModule> | undefined;
  const initialize = () => {
    if (pending !== undefined) return pending;
    pending = new Promise<InspectModule>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("校验器加载超时")),
        10000,
      );
      Promise.resolve()
        .then(load)
        .then(
          (module) => {
            clearTimeout(timeout);
            resolve(module);
          },
          (cause: unknown) => {
            clearTimeout(timeout);
            reject(cause);
          },
        );
    }).catch((cause: unknown) => {
      pending = undefined;
      throw cause;
    });
    return pending;
  };
  return (source: string): DataTask<HtmlInspection> =>
    createDataTask<HtmlInspection, DataError>(async (signal) => {
      try {
        const module = await initialize();
        if (signal.aborted) return err(cancelled());
        const inspection = parseHtmlInspection(
          JSON.parse(module.inspect_html(source)),
        );
        if (signal.aborted) return err(cancelled());
        return ok(inspection);
      } catch (cause) {
        if (signal.aborted) return err(cancelled());
        return err({
          kind: "protocol",
          message:
            cause instanceof Error
              ? `HTML 校验不可用：${cause.message}`
              : "HTML 校验不可用",
        });
      }
    });
}

export const inspectHtml = createHtmlInspector(loadWasm);
