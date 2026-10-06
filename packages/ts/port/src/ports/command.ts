import type { Result } from "@fluvient/core";

export type CommandKind = "atomic" | "compensatable" | "retryable";

export interface CommandContext {
  readonly operationId: string;
  readonly sequence: number;
}

/** Human-readable description of a prepared command; `summary` is the plan line. */
export interface CommandDescription {
  readonly summary: string;
  readonly details?: readonly string[];
}

export interface PreparedCommand<E> {
  /** Optional: dry-run plan rendering reads this. Missing descriptions fall back to a generic line. */
  describe?(): CommandDescription;
  execute(): Promise<Result<void, E>>;
  compensate(): Promise<Result<void, E>>;
}

export interface ReversibleCommand<Input, E> {
  readonly kind: CommandKind;
  prepare(
    input: Input,
    context: CommandContext,
  ): Promise<Result<PreparedCommand<E>, E>>;
}

export interface IrreversibleCommand<Input, E> {
  readonly kind: "irreversible";
  execute(input: Input, context: CommandContext): Promise<Result<void, E>>;
}

export interface OperationIdPort {
  next(): string;
}
