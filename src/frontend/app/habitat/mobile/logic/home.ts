import { createEffect, createSignal } from "solid-js";
import type { MobileApi, TShelfInput } from "../../api/mobile";
import { useMobileResource } from "../resource";

export interface MobileHomeLogicInput {
  readonly api: Pick<MobileApi, "tShelf">;
}

export function useMobileHome(input: MobileHomeLogicInput) {
  const [selection, setSelection] = createSignal<TShelfInput>({
    surface: "recommendation",
    filterId: "all",
  });
  const resource = useMobileResource(() => input.api.tShelf.get(selection()));
  let started = false;

  createEffect(() => {
    selection();
    if (!started) {
      started = true;
      void resource.start();
      return;
    }
    void resource.refetch();
  });

  return {
    selection,
    selectFilter(filterId: string) {
      setSelection({ surface: "recommendation", filterId });
    },
    resource,
    snapshot: () => resource.state().snapshot ?? resource.state().latest,
    retry: () => void resource.refetch(),
  };
}
