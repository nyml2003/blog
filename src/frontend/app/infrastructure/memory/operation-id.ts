import type { OperationIdPort } from "../../kernel/ports";

export function createMemoryOperationId(prefix = "operation"): OperationIdPort {
  let sequence = 0;
  return {
    next() {
      sequence += 1;
      return `${prefix}-${sequence}`;
    },
  };
}
