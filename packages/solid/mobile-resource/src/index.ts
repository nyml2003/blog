import { createDataResource } from "@fluvient-loom/query";
import type { DataResource, DataResourceState } from "@fluvient-loom/query";
import type { DataTask } from "@fluvient-loom/port";
import { createSignal, onCleanup } from "solid-js";

export function useMobileResource<T, E>(
  createTask: () => DataTask<T, E>,
): DataResource<T, E> & {
  readonly state: () => ReturnType<DataResource<T, E>["getSnapshot"]>;
} {
  const resource = createDataResource(createTask);
  const [state, setState] = createSignal<DataResourceState<T, E>>(
    resource.getSnapshot(),
  );
  const unsubscribe = resource.subscribe(() => setState(resource.getSnapshot()));
  onCleanup(() => {
    unsubscribe();
    resource.cancel();
  });
  return { ...resource, state };
}
