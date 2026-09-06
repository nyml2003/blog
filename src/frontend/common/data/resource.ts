import { cancelled, type DataError } from "./errors";
import type { DeepReadonly } from "./readonly";
import type { Result } from "./result";
import type { DataTask } from "./task";

function isCancelledError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("kind" in error)) {
    return false;
  }
  return error.kind === "cancelled";
}

function rejectedTaskError(cause: unknown): DataError {
  return {
    kind: "network",
    message: cause instanceof Error ? cause.message : "数据任务异常结束",
  };
}

export type DataResourceStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "cancelled";

export interface DataResourceState<T, E = DataError> {
  readonly status: DataResourceStatus;
  readonly snapshot: DeepReadonly<T> | undefined;
  readonly latest: DeepReadonly<T> | undefined;
  readonly error: E | undefined;
}

export interface DataResource<T, E = DataError> {
  getSnapshot(): DataResourceState<T, E>;
  subscribe(listener: () => void): () => void;
  start(): Promise<Result<DeepReadonly<T>, E>>;
  refetch(): Promise<Result<DeepReadonly<T>, E>>;
  cancel(): void;
}

export function createDataResource<T, E = DataError>(
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
  let running: Promise<Result<DeepReadonly<T>, E>> | undefined;
  let lastResult: Promise<Result<DeepReadonly<T>, E>> | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    const currentListeners = Array.from(listeners);
    for (const listener of currentListeners) listener();
  };

  const replace = (next: DataResourceState<T, E>) => {
    state = next;
    notify();
  };

  const execute = (force: boolean) => {
    if (!force && started) {
      return (
        lastResult ?? Promise.resolve({ ok: false, error: cancelled() as E })
      );
    }

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

    running = task
      .start()
      .then((result) => {
        if (currentGeneration !== generation) return result;
        active = undefined;
        running = undefined;
        if (result.ok) {
          replace({
            status: "success",
            snapshot: result.value,
            latest: result.value,
            error: undefined,
          });
        } else {
          replace({
            status: isCancelledError(result.error) ? "cancelled" : "error",
            snapshot: undefined,
            latest: state.latest,
            error: result.error,
          });
        }
        return result;
      })
      .catch((cause: unknown) => {
        const error = rejectedTaskError(cause) as E;
        if (currentGeneration !== generation)
          return { ok: false as const, error };
        active = undefined;
        running = undefined;
        replace({
          status: "error",
          snapshot: undefined,
          latest: state.latest,
          error,
        });
        return { ok: false as const, error };
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
      if (active === undefined) return;
      generation += 1;
      active.cancel();
      active = undefined;
      running = undefined;
      const error = cancelled() as E;
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
