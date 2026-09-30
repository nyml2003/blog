import { createEffect, createSignal, onCleanup } from "solid-js";
import type { DeepReadonly } from "../../kernel";
import type { DataTask } from "../../kernel/ports";

export function useDesktopResource<T, E>(createTask: () => DataTask<T, E>) {
  const [state, setState] = createSignal<{
    status: "idle" | "loading" | "success" | "error";
    snapshot: DeepReadonly<T> | undefined;
    error: E | undefined;
  }>({ status: "idle", snapshot: undefined, error: undefined });
  let task: DataTask<T, E> | undefined;
  const load = () => {
    task?.cancel();
    task = createTask();
    setState({ status: "loading", snapshot: undefined, error: undefined });
    void task.start().then((result) => {
      if (!result.ok) {
        setState({ status: "error", snapshot: undefined, error: result.error as E });
        return;
      }
      setState({ status: "success", snapshot: result.value, error: undefined });
    });
  };
  createEffect(load);
  onCleanup(() => task?.cancel());
  return { state, reload: load };
}
