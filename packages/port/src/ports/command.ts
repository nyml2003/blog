import type { Result } from "@fluvient-loom/common";

export type CommandKind = "atomic" | "compensatable" | "retryable";

export interface CommandContext {
  readonly operationId: string;
  readonly sequence: number;
}

export interface PreparedCommand<E> {
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
