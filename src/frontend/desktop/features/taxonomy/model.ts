import { createSignal } from "solid-js";
import type { DesktopApi, Taxonomy, Workspace } from "../../foundation/api";
import { useDesktopResource } from "../../foundation/resource";
import { parseTaxonomy } from "./input";

export { parseTaxonomy } from "./input";

export function formatTaxonomy(taxonomy: Taxonomy): string {
  return JSON.stringify(
    {
      ...taxonomy,
      categories: taxonomy.categories.map((category) => ({
        ...category,
        parentId: category.parentId ?? null,
      })),
    },
    undefined,
    2,
  );
}

export function useDesktopTaxonomy(api: Pick<DesktopApi, "content">) {
  const workspace = useDesktopResource(() => api.content.workspace());
  const [source, setSource] = createSignal("");
  const [dirty, setDirty] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const [preview, setPreview] = createSignal<{
    diff: string;
    warnings: readonly string[];
  }>();
  let loadedVersion = -1;
  const current = () => workspace.state().snapshot;
  const syncSource = (value: Workspace) => {
    if (dirty() || value.version === loadedVersion) return;
    setSource(formatTaxonomy(value.taxonomy));
    loadedVersion = value.version;
  };
  const run = async (
    action: () => ReturnType<DesktopApi["content"]["workspace"]>,
    success: string,
  ) => {
    if (busy()) return;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await action().start();
    if (!result.ok) {
      setError("工作区操作失败，请重试");
      setBusy(false);
      return;
    }
    syncSource(result.value);
    setDirty(false);
    setMessage(success);
    setBusy(false);
  };
  return {
    workspace,
    current,
    source,
    setSource: (value: string) => {
      setSource(value);
      setDirty(true);
    },
    dirty,
    busy,
    message,
    error,
    preview,
    save: () => {
      const value = current();
      const parsed = parseTaxonomy(source());
      if (!value) return;
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      void run(
        () =>
          api.content.saveTaxonomy({
            expectedVersion: value.version,
            taxonomy: parsed.value,
          }),
        "taxonomy 已保存到工作区",
      );
    },
    analyze: () => {
      const value = current();
      if (value)
        void run(
          () =>
            api.content.analyze({
              expectedVersion: value.version,
              articleIds: value.articles.map((article) => article.id),
            }),
          "模型分析已应用",
        );
    },
    review: () => {
      const value = current();
      if (value)
        void run(
          () => api.content.review({ expectedVersion: value.version }),
          "一次复核已完成",
        );
    },
    submit: () => {
      const value = current();
      if (value)
        void run(
          () => api.content.submit({ expectedVersion: value.version }),
          "批次已提交",
        );
    },
    abandon: () => {
      const value = current();
      if (value && window.confirm("确定放弃当前待提交批次？"))
        void run(
          () => api.content.abandon({ expectedVersion: value.version }),
          "已放弃待提交批次",
        );
    },
    refreshPreview: async () => {
      const result = await api.content.preview().start();
      if (!result.ok) {
        setError("预览失败，请重试");
        return;
      }
      setPreview({ diff: result.value.diff, warnings: result.value.warnings });
      setMessage("预览已刷新");
    },
    syncSource,
  };
}
