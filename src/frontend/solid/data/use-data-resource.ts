import {
  type Accessor,
  createRenderEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import type { DataError } from "../../common/data/errors";
import type { DeepReadonly } from "../../common/data/readonly";
import type { Result } from "../../common/data/result";
import {
  createDataResource,
  type DataResource,
  type DataResourceState,
  type DataResourceStatus,
} from "../../common/data/resource";
import type { DataTask } from "../../common/data/task";

export interface SolidDataResource<T, E = DataError> {
  readonly state: Accessor<DataResourceState<T, E>>;
  readonly status: Accessor<DataResourceStatus>;
  readonly snapshot: Accessor<DeepReadonly<T> | undefined>;
  readonly latest: Accessor<DeepReadonly<T> | undefined>;
  readonly loading: Accessor<boolean>;
  readonly error: Accessor<E | undefined>;
  readonly start: () => Promise<Result<DeepReadonly<T>, E>>;
  readonly refetch: () => Promise<Result<DeepReadonly<T>, E>>;
  readonly cancel: () => void;
}

const idleState = <T, E>(): DataResourceState<T, E> => ({
  status: "idle",
  snapshot: undefined,
  latest: undefined,
  error: undefined,
});

/** Bridges a framework-neutral resource into Solid's reactive accessors. */
export function useDataResource<T, I, E = DataError>(
  input: Accessor<I>,
  createTask: (input: I) => DataTask<T, E>,
  options: { readonly autoStart?: boolean } = {},
): SolidDataResource<T, E> {
  const [state, setState] = createSignal<DataResourceState<T, E>>(idleState());
  let resource: DataResource<T, E> | undefined;
  let unsubscribe: (() => void) | undefined;

  const replaceResource = (value: I) => {
    unsubscribe?.();
    resource?.cancel();
    const next = createDataResource(() => createTask(value));
    resource = next;
    unsubscribe = next.subscribe(() => setState(next.getSnapshot()));
    setState(next.getSnapshot());
    if (options.autoStart !== false) void next.start();
  };

  createRenderEffect(() => {
    const value = input();
    replaceResource(value);
  });

  onCleanup(() => {
    unsubscribe?.();
    resource?.cancel();
    resource = undefined;
  });

  const command = (
    action: (
      current: DataResource<T, E>,
    ) => Promise<Result<DeepReadonly<T>, E>>,
  ) => {
    if (resource === undefined) {
      return Promise.resolve({
        ok: false as const,
        error: { kind: "cancelled" } as E,
      });
    }
    return action(resource);
  };

  return {
    state,
    status: () => state().status,
    snapshot: () => state().snapshot,
    latest: () => state().latest,
    loading: () => state().status === "loading",
    error: () => state().error,
    start: () => command((current) => current.start()),
    refetch: () => command((current) => current.refetch()),
    cancel: () => resource?.cancel(),
  };
}
