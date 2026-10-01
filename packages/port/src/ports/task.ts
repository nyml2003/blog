import type {
  CancellationFailure,
  CancellationSignal,
  CancellationSource,
  DeepReadonly,
  Result,
} from "@fluvient/core";

export interface TaskFailure {
  readonly kind: "task";
  readonly message: string;
}

export interface DataTask<T, E = never> {
  start(): Promise<
    Result<DeepReadonly<T>, E | CancellationFailure | TaskFailure>
  >;
  cancel(): void;
}

export interface DataTaskDefinition<T, E> {
  execute(
    signal: CancellationSignal,
  ): Promise<Result<T, E | CancellationFailure>>;
  mapRejected(cause: unknown): E;
}

export type CancellationSourceFactory = () => CancellationSource;
