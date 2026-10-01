import {
  cancellationFailure,
  type CancellationFailure,
  type DeepReadonly,
  type Result,
} from "@fluvient/core";
import type { DataTask, TaskFailure } from "@fluvient-loom/port";

function isCancellationFailure(error: unknown): error is CancellationFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    error.kind === "cancelled"
  );
}

export type DataResourceStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "cancelled";

export interface DataResourceState<T, E> {
  readonly status: DataResourceStatus;
  readonly snapshot: DeepReadonly<T> | undefined;
  readonly latest: DeepReadonly<T> | undefined;
  readonly error: E | CancellationFailure | TaskFailure | undefined;
}

export interface DataResource<T, E> {
  getSnapshot(): DataResourceState<T, E>;
  subscribe(listener: () => void): () => void;
  start(): Promise<
    Result<DeepReadonly<T>, E | CancellationFailure | TaskFailure>
  >;
  refetch(): Promise<
    Result<DeepReadonly<T>, E | CancellationFailure | TaskFailure>
  >;
  cancel(): void;
}

export function createDataResource<T, E>(
  createTask: () => DataTask<T, E>,
): DataResource<T, E> {
  let state: DataResourceState<T, E> = {
    status: "idle",
    snapshot: undefined,
    latest: undefined,
    error: undefined,
  };
  let active: DataTask<T, E> | undefined;
  let generation = 0;
  let started = false;
  let lastResult:
    | Promise<Result<DeepReadonly<T>, E | CancellationFailure | TaskFailure>>
    | undefined;
  const listeners = new Set<() => void>();

  const replace = (next: DataResourceState<T, E>) => {
    state = next;
    for (const listener of Array.from(listeners)) listener();
  };

  const execute = (force: boolean) => {
    if (!force && started)
      return (
        lastResult ??
        Promise.resolve({ ok: false, error: cancellationFailure() })
      );
    if (!force) started = true;
    active?.cancel();
    const currentGeneration = ++generation;
    const task = createTask();
    active = task;
    replace({
      status: "loading",
      snapshot: undefined,
      latest: state.latest,
      error: undefined,
    });
    const running = task.start().then((result) => {
      if (currentGeneration !== generation) return result;
      active = undefined;
      if (result.ok) {
        replace({
          status: "success",
          snapshot: result.value,
          latest: result.value,
          error: undefined,
        });
      } else {
        replace({
          status: isCancellationFailure(result.error) ? "cancelled" : "error",
          snapshot: undefined,
          latest: state.latest,
          error: result.error,
        });
      }
      return result;
    });
    lastResult = running;
    return running;
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => execute(false),
    refetch: () => execute(true),
    cancel() {
      if (!active) return;
      generation += 1;
      active.cancel();
      active = undefined;
      const error = cancellationFailure();
      lastResult = Promise.resolve({ ok: false, error });
      replace({
        status: "cancelled",
        snapshot: undefined,
        latest: state.latest,
        error,
      });
    },
  };
}
