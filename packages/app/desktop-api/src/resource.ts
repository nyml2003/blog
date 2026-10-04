import { createEffect, createSignal, onCleanup } from "solid-js";
import { createDataResource } from "@fluvient-loom/query";
import { type DataTask } from "@fluvient-loom/port";

export function useDesktopResource<T, E>(createTask: () => DataTask<T, E>) {
  const resource = createDataResource(createTask);
  const [state, setState] = createSignal(resource.getSnapshot());
  const unsubscribe = resource.subscribe(() =>
    setState(resource.getSnapshot()),
  );
  createEffect(() => {
    void resource.start();
  });
  onCleanup(() => {
    unsubscribe();
    resource.cancel();
  });
  return { state, reload: () => resource.refetch() };
}
