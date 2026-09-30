import { createSignal } from "solid-js";
import type { DesktopApi } from "../../api/desktop";
import { useDesktopResource } from "../resource";

export function useDesktopArticle(api: Pick<DesktopApi, "article">, id: number | undefined) {
  const [articleId] = createSignal(id);
  const resource = useDesktopResource(() => {
    const value = articleId();
    if (value === undefined) throw new Error("缺少或无效的文章 ID");
    return api.article.getPublished(value);
  });
  return { resource };
}
