import { createDataResource, type DataResource } from "@fluvient-loom/query";
import type { DataTask, TaskFailure } from "@fluvient-loom/port";
import type { CancellationFailure, DeepReadonly, Result } from "@fluvient/core";

export interface WeappResource<T, E> {
  readonly resource: DataResource<T, E>;
  run(factory: () => DataTask<T, E>): Promise<Result<DeepReadonly<T>, E | CancellationFailure | TaskFailure>>;
}

export function createWeappResource<T, E>(): WeappResource<T, E> {
  let factory: (() => DataTask<T, E>) | undefined;
  const resource = createDataResource(() => {
    if (factory === undefined) throw new Error("weapp resource factory missing");
    return factory();
  });
  return {
    resource,
    run(nextFactory) {
      factory = nextFactory;
      return resource.refetch();
    },
  };
}
