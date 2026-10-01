import {
  cancellationFailure,
  createCancellationSource,
  err,
  readonlyView,
  type CancellationFailure,
  type CancellationSource,
  type DeepReadonly,
  type ResourceHandle,
  type Result,
} from "@fluvient/core";
import type {
  CancellationSourceFactory,
  DataTask,
  DataTaskDefinition,
  TaskFailure,
} from "@fluvient-loom/port";

type TaskResult<T, E> = Result<
  DeepReadonly<T>,
  E | CancellationFailure | TaskFailure
>;

function taskFailure(cause: unknown): TaskFailure {
  return {
    kind: "task",
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

export function createDataTask<T, E>(
  definition: DataTaskDefinition<T, E>,
  sourceFactory: CancellationSourceFactory = createCancellationSource,
): DataTask<T, E> {
  let started = false;
  let cancelledBeforeStart = false;
  let running: Promise<TaskResult<T, E>> | undefined;
  let source: CancellationSource | undefined;

  return {
    start(): Promise<TaskResult<T, E>> {
      if (started) {
        if (running) return running;
        const cancelledResult = Promise.resolve(err(cancellationFailure()));
        running = cancelledResult;
        return cancelledResult;
      }
      started = true;
      const createdSource = sourceFactory();
      source = createdSource;
      if (cancelledBeforeStart) {
        createdSource.cancel();
        const cancelledResult = Promise.resolve(err(cancellationFailure()));
        running = cancelledResult;
        return cancelledResult;
      }
      let cancellationHandle: ResourceHandle | undefined;
      const cancellationPromise = new Promise<TaskResult<T, E>>((resolve) => {
        cancellationHandle = createdSource.signal.subscribe(() => {
          cancellationHandle?.release();
          resolve(err(cancellationFailure()));
        });
      });
      const executionPromise = Promise.resolve()
        .then(() => definition.execute(createdSource.signal))
        .then((result): TaskResult<T, E> => {
          if (!result.ok) return result;
          return { ok: true, value: readonlyView(result.value) };
        })
        .catch((cause: unknown): TaskResult<T, E> => {
          try {
            return err(definition.mapRejected(cause));
          } catch (mappingCause) {
            return err(taskFailure(mappingCause));
          }
        })
        .finally(() => cancellationHandle?.release());
      const taskPromise = Promise.race([executionPromise, cancellationPromise]);
      running = taskPromise;
      return taskPromise;
    },
    cancel() {
      if (!started) {
        cancelledBeforeStart = true;
        return;
      }
      source?.cancel();
    },
  };
}
