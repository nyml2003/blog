import { createSignal } from "solid-js";
import type { DesktopApi } from "@blog/desktop-api";
import { useDesktopResource } from "@blog/desktop-api";

export function useDesktopAdminHome(api: Pick<DesktopApi, "content">) {
  const articles = useDesktopResource(() => api.content.listArticles());
  const [busyId, setBusyId] = createSignal<number | undefined>();
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const remove = async (articleId: number, title: string) => {
    const version = articles.state().snapshot?.version;
    if (
      version === undefined ||
      busyId() !== undefined ||
      !window.confirm(
        `将《${title || "未命名文章"}》暂存下架到当前待提交批次？`,
      )
    )
      return;
    setBusyId(articleId);
    setMessage("");
    setError("");
    const result = await api.content
      .removeArticle({ expectedVersion: version, articleId })
      .start();
    if (!result.ok) {
      setError("暂存下架失败，请重试");
      setBusyId(undefined);
      return;
    }
    setMessage("已暂存下架到待提交批次，公共内容尚未改变。");
    await articles.reload();
    setBusyId(undefined);
  };
  return { articles, busyId, message, error, remove };
}
