import type { DocumentPort } from "../../kernel/ports";

export interface BrowserDocumentOptions {
  readonly root: Pick<HTMLElement, "getAttribute" | "setAttribute">;
}

export function createBrowserDocument(
  options: BrowserDocumentOptions,
): DocumentPort {
  return {
    readRootAttribute(name) {
      return options.root.getAttribute(name) ?? undefined;
    },
    writeRootAttribute(name, value) {
      options.root.setAttribute(name, value);
    },
  };
}
