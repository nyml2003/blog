import type { Result } from "@fluvient-loom/common";
import type {
  CommandContext,
  OperationIdPort,
  ReversibleCommand,
  SchedulerPort,
} from "@fluvient-loom/port";

export type DesiredStateMutationStatus =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "recovering";

export interface DesiredStateMutationState<T, E> {
  readonly status: DesiredStateMutationStatus;
  readonly value: T;
  readonly error: E | undefined;
}

export interface DesiredStateCommandInput<T> {
  readonly previous: T;
  readonly next: T;
  readonly changes: Partial<T>;
}

export interface DesiredStateMutationOptions<T, E> {
  readonly initial: T;
  readonly disposedError: E;
  readonly scheduler: SchedulerPort;
  readonly operationIds: OperationIdPort;
  readonly command: ReversibleCommand<DesiredStateCommandInput<T>, E>;
  readonly invalidate: () => Promise<Result<T, E>>;
  readonly onState: (state: T) => void;
}

export interface DesiredStateMutation<T, E> {
  readonly state: () => DesiredStateMutationState<T, E>;
  update(changes: Partial<T>): Promise<Result<void, E>>;
  flush(): Promise<Result<void, E>>;
  retry(): Promise<Result<void, E>>;
  reconcile(value: T): void;
  dispose(): void;
}

interface Pending<T, E> {
  readonly changes: Partial<T>;
  readonly sequence: number;
  readonly resolve: (result: Result<void, E>) => void;
}

interface FailedBatch<T, E> {
  readonly changes: readonly Partial<T>[];
  readonly error: E;
}

function applyChanges<T>(state: T, changes: readonly Partial<T>[]): T {
  return Object.assign({}, state, ...changes);
}

function mergeChanges<T>(changes: readonly Partial<T>[]): Partial<T> {
  return Object.assign({}, ...changes) as Partial<T>;
}

export function createDesiredStateMutation<T, E>(
  options: DesiredStateMutationOptions<T, E>,
): DesiredStateMutation<T, E> {
  let committed = options.initial;
  let optimistic = options.initial;
  let sequence = 0;
  let pending: Pending<T, E>[] = [];
  let active: Promise<Result<void, E>> | undefined;
  let scheduled = false;
  let released = false;
  let failed: FailedBatch<T, E> | undefined;
  let currentState: DesiredStateMutationState<T, E> = {
    status: "idle",
    value: optimistic,
    error: undefined,
  };

  const publish = (
    status: DesiredStateMutationStatus,
    error: E | undefined = undefined,
  ) => {
    currentState = { status, value: optimistic, error };
    options.onState(optimistic);
  };

  const schedule = () => {
    if (scheduled || released || pending.length === 0) return;
    scheduled = true;
    options.scheduler.microtask(() => {
      scheduled = false;
      void flush();
    });
  };

  const settlePending = (
    batch: readonly Pending<T, E>[],
    result: Result<void, E>,
  ) => {
    for (const item of batch) item.resolve(result);
  };

  const runBatch = (batch: readonly Pending<T, E>[]) => {
    const changes = batch.map((item) => item.changes);
    const previous = committed;
    const next = applyChanges(previous, changes);
    optimistic = applyChanges(committed, [
      ...changes,
      ...pending.map((item) => item.changes),
    ]);
    publish("pending");
    const context: CommandContext = {
      operationId: options.operationIds.next(),
      sequence: batch[batch.length - 1]?.sequence ?? sequence,
    };

    const running = (async (): Promise<Result<void, E>> => {
      const prepared = await options.command.prepare(
        { previous, next, changes: mergeChanges(changes) },
        context,
      );
      if (!prepared.ok) {
        failed = { changes, error: prepared.error };
        optimistic = applyChanges(
          committed,
          pending.map((item) => item.changes),
        );
        publish("error", prepared.error);
        settlePending(batch, prepared);
        if (pending.length > 0) schedule();
        return prepared;
      }
      const executed = await prepared.value.execute();
      if (!executed.ok) {
        failed = { changes, error: executed.error };
        optimistic = applyChanges(
          committed,
          pending.map((item) => item.changes),
        );
        publish("error", executed.error);
        settlePending(batch, executed);
        if (pending.length > 0) schedule();
        return executed;
      }

      committed = next;
      const refreshed = await options.invalidate();
      if (refreshed.ok) committed = refreshed.value;
      optimistic = applyChanges(
        committed,
        pending.map((item) => item.changes),
      );
      failed = undefined;
      publish("success");
      settlePending(batch, executed);
      if (pending.length > 0) schedule();
      return executed;
    })();
    const settled = running.finally(() => {
      if (active === settled) {
        active = undefined;
        if (pending.length > 0) schedule();
      }
    });
    active = settled;
    return settled;
  };

  const flush = (): Promise<Result<void, E>> => {
    if (active) return active;
    if (pending.length === 0) {
      return Promise.resolve({ ok: true, value: undefined });
    }
    const batch = pending;
    pending = [];
    return runBatch(batch);
  };

  return {
    state: () => currentState,
    update(changes) {
      if (released) {
        return Promise.resolve({ ok: false, error: options.disposedError });
      }
      sequence += 1;
      optimistic = applyChanges(optimistic, [changes]);
      publish("pending");
      return new Promise<Result<void, E>>((resolve) => {
        pending.push({ changes, sequence, resolve });
        schedule();
      });
    },
    flush,
    retry() {
      if (!failed) return Promise.resolve({ ok: true, value: undefined });
      const previous = failed;
      failed = undefined;
      const result = new Promise<Result<void, E>>((resolve) => {
        const retried = previous.changes.map((changes) => {
          sequence += 1;
          return { changes, sequence, resolve };
        });
        pending = [...retried, ...pending];
      });
      optimistic = applyChanges(
        committed,
        pending.map((item) => item.changes),
      );
      publish("pending");
      schedule();
      return result;
    },
    reconcile(value) {
      committed = value;
      optimistic = applyChanges(
        committed,
        pending.map((item) => item.changes),
      );
      publish(currentState.status, currentState.error);
    },
    dispose() {
      released = true;
      pending = [];
    },
  };
}
