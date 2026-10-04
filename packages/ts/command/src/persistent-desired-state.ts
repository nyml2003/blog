import type {
  CancellationFailure,
  DeepReadonly,
  Result,
} from "@fluvient/core";
import type {
  DataTask,
  OperationIdPort,
  PersistencePort,
  ReversibleCommand,
  SchedulerPort,
  TaskFailure,
} from "@fluvient-loom/port";
import {
  createDesiredStateMutation,
  type DesiredStateCommandInput,
  type DesiredStateMutation,
  type DesiredStateMutationState,
} from "./desired-state.ts";

export type ReconcileResult<T, E> = Result<
  DeepReadonly<T>,
  E | CancellationFailure | TaskFailure
>;

export interface PersistentDesiredStateOptions<T, E> {
  /** Synchronous restore; runs once at creation, before any projection. */
  readonly persistence: PersistencePort;
  readonly restore: (persistence: PersistencePort) => T;
  /** Fresh task per reconciliation run (initial load, invalidate, retry). */
  readonly reconcileTask: () => DataTask<T, E>;
  readonly scheduler: SchedulerPort;
  readonly operationIds: OperationIdPort;
  readonly command: ReversibleCommand<DesiredStateCommandInput<T>, E>;
  readonly disposedError: E;
  /**
   * The single projection hook: restore, reconcile, optimistic update,
   * rollback, and retry all flow through it.
   */
  readonly project: (state: T) => void;
}

export interface PersistentDesiredState<T, E>
  extends DesiredStateMutation<T, E> {
  reconcile(): Promise<ReconcileResult<T, E>>;
}

export function createPersistentDesiredState<T, E>(
  options: PersistentDesiredStateOptions<T, E>,
): PersistentDesiredState<T, E> {
  const initial = options.restore(options.persistence);
  options.project(initial);

  const mutation = createDesiredStateMutation<T, E>({
    initial,
    disposedError: options.disposedError,
    scheduler: options.scheduler,
    operationIds: options.operationIds,
    command: options.command,
    // After a successful write, refresh `committed` from the reconciled truth.
    // A failed refresh never rolls the write back (the mutation ignores
    // invalidate failures), so the error lane here is a type channel only.
    invalidate: async () => {
      const result = await options.reconcileTask().start();
      if (result.ok) return { ok: true as const, value: result.value as T };
      return { ok: false as const, error: result.error as E };
    },
    onState: (value) => options.project(value),
  });

  return {
    state: mutation.state,
    update: mutation.update,
    flush: mutation.flush,
    retry: mutation.retry,
    dispose: mutation.dispose,
    reconcile() {
      return options.reconcileTask().start().then((result) => {
        if (result.ok) mutation.reconcile(result.value as T);
        return result;
      });
    },
  };
}

export type {
  DesiredStateCommandInput,
  DesiredStateMutation,
  DesiredStateMutationState,
};
