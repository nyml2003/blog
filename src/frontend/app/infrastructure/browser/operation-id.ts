import type { OperationIdPort } from "../../kernel/ports";

export function createBrowserOperationId(): OperationIdPort {
  return {
    next() {
      return crypto.randomUUID();
    },
  };
}
