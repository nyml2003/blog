import type { DocumentPort } from "@fluvient-loom/port";

export interface WebDocumentRoot {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

export interface WebDocumentOptions {
  /** Defaults to the browser's `document.documentElement`. */
  readonly root?: WebDocumentRoot;
}

export function createWebDocument(
  options: WebDocumentOptions = {},
): DocumentPort {
  const root =
    options.root ??
    (typeof document === "undefined"
      ? undefined
      : document.documentElement);
  if (root === undefined) {
    throw new Error(
      "createWebDocument: 全局 document 不存在，须显式注入 options.root",
    );
  }
  return {
    readRootAttribute(name) {
      return root.getAttribute(name) ?? undefined;
    },
    writeRootAttribute(name, value) {
      root.setAttribute(name, value);
    },
  };
}
