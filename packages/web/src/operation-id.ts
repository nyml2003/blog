import type { OperationIdPort } from "@fluvient-loom/port";

type RandomUUIDLike = () => string;

export interface WebOperationIdOptions {
  /** Web-standard `crypto.randomUUID`. Inject to override or fake in tests. */
  readonly randomUUID?: RandomUUIDLike;
}

/**
 * RFC 4122 v4 from `crypto.getRandomValues` — the fallback for insecure
 * contexts (plain-HTTP LAN access), where browsers hide `randomUUID` but
 * keep `getRandomValues`.
 */
export function uuidV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createWebOperationId(
  options: WebOperationIdOptions = {},
): OperationIdPort {
  const randomUUID: RandomUUIDLike | undefined =
    options.randomUUID ??
    (typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID.bind(crypto)
      : typeof crypto !== "undefined" &&
          typeof crypto.getRandomValues === "function"
        ? uuidV4
        : undefined);
  if (randomUUID === undefined) {
    throw new Error(
      "createWebOperationId: 标准 crypto 不可用（randomUUID 与 getRandomValues 均缺失），须显式注入 options.randomUUID",
    );
  }
  return {
    next() {
      return randomUUID();
    },
  };
}
