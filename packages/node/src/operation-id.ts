import type { OperationIdPort } from "@fluvient-loom/port";

type RandomUUIDLike = () => string;

export interface NodeOperationIdOptions {
  /** Node exposes the Web-standard `crypto.randomUUID`; inject to fake. */
  readonly randomUUID?: RandomUUIDLike;
}

export function createNodeOperationId(
  options: NodeOperationIdOptions = {},
): OperationIdPort {
  const randomUUID =
    options.randomUUID ??
    (typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID.bind(crypto)
      : undefined);
  if (randomUUID === undefined) {
    throw new Error(
      "createNodeOperationId: 标准 crypto.randomUUID 不存在，须显式注入 options.randomUUID",
    );
  }
  return {
    next() {
      return randomUUID();
    },
  };
}
