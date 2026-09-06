import { cancelled, type DataError } from "./errors";
import type { DeepReadonly } from "./readonly";
import type { Result } from "./result";

export interface DataTask<T, E = DataError> {
  start(): Promise<Result<DeepReadonly<T>, E>>;
  cancel(): void;
}

export function createDataTask<T, E = DataError>(
  execute: (signal: AbortSignal) => Promise<Result<T, E>>,
): DataTask<T, E> {
  const controller = new AbortController();
  let started = false;
  let cancelledBeforeStart = false;
  let running: Promise<Result<DeepReadonly<T>, E>> | undefined;

  return {
    start() {
      if (started) return running!;
      started = true;
      if (cancelledBeforeStart) {
        running = Promise.resolve({ ok: false, error: cancelled() as E });
      } else {
        running = execute(controller.signal) as Promise<
          Result<DeepReadonly<T>, E>
        >;
      }
      return running;
    },
    cancel() {
      if (started) controller.abort();
      else cancelledBeforeStart = true;
    },
  };
}
