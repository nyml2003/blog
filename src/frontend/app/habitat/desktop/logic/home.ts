import { createSignal } from "solid-js";
import type { DesktopApi, TShelfInput } from "../../api/desktop";
import { useDesktopResource } from "../resource";

export function useDesktopHome(api: Pick<DesktopApi, "tShelf">) {
  const [recommendationSelection, setRecommendationSelection] =
    createSignal<TShelfInput>({ surface: "recommendation", filterId: "all" });
  const [archiveSelection, setArchiveSelection] = createSignal<TShelfInput>({
    surface: "archive",
    filterId: "all",
  });
  const recommendations = useDesktopResource(() =>
    api.tShelf.get(recommendationSelection()),
  );
  const archive = useDesktopResource(() => api.tShelf.get(archiveSelection()));
  return {
    recommendationSelection,
    archiveSelection,
    recommendations,
    archive,
    selectRecommendation(filterId: string) {
      setRecommendationSelection({ surface: "recommendation", filterId });
    },
    selectArchive(filterId: string) {
      setArchiveSelection({ surface: "archive", filterId });
    },
  };
}
