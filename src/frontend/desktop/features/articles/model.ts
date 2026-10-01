import { createSignal } from "solid-js";
import type { DesktopApi, TShelfInput } from "../../foundation/api";
import { useDesktopResource } from "../../foundation/resource";

export function useDesktopArticles(
  api: Pick<DesktopApi, "tShelf">,
  initialFilterId: string,
) {
  const [selection, setSelection] = createSignal<TShelfInput>({
    surface: "archive",
    filterId: initialFilterId,
  });
  const resource = useDesktopResource(() => api.tShelf.get(selection()));
  return {
    selection,
    resource,
    selectFilter: (filterId: string) =>
      setSelection({ surface: "archive", filterId }),
  };
}
