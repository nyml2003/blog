import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { browserClient as client } from "../../../../common/client";
import type { DataTask } from "../../../../common/data/task";
import { useDataResource } from "../../../../solid/data";
import { Header, Status } from "../../app";

type Item = { id: number; name: string; kind?: string };
const isTerms = location.pathname.includes("terms");
const App = () => {
  const items = useDataResource(
    () => isTerms,
    (terms) =>
      (terms
        ? client.taxonomy.listTerms(true)
        : client.taxonomy.listTypes(true)) as unknown as DataTask<Item[]>,
  );
  const [name, setName] = createSignal(""),
    [termKind, setTermKind] = createSignal("tag"),
    [busy, setBusy] = createSignal(false),
    [message, setMessage] = createSignal(""),
    [error, setError] = createSignal("");
  const submit = async () => {
    if (!name().trim()) return;
    setBusy(true);
    setError("");
    try {
      const task = isTerms
        ? client.taxonomy.createTerm(
            name().trim(),
            termKind() as "topic" | "tag",
          )
        : client.taxonomy.createType(name().trim());
      const result = await task.start();
      if (!result.ok) throw new Error(result.error.kind);
      setName("");
      setMessage("已创建");
      void items.refetch();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rename = async (item: Item) => {
    const next = prompt("新的名称", item.name)?.trim();
    if (!next || next === item.name) return;
    setBusy(true);
    setError("");
    try {
      const task = isTerms
        ? client.taxonomy.renameTerm(item.id, next)
        : client.taxonomy.renameType(item.id, next);
      const result = await task.start();
      if (!result.ok) throw new Error(result.error.kind);
      setMessage("名称已更新");
      void items.refetch();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const taxonomyItems = () => items.snapshot() ?? [];
  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page taxonomy-page">
        <header class="admin-page-head">
          <div>
            <p class="eyebrow">CONTENT MODEL</p>
            <h1>{isTerms ? "主题/标签管理" : "文章类型管理"}</h1>
            <p>这些字段用于前台分类、筛选和文章语义标注。</p>
          </div>
        </header>
        <Status busy={busy()} error={error()} ok={message()} />
        <div class="actions">
          <div class="field">
            <label for="new-name">名称</label>
            <input
              id="new-name"
              value={name()}
              onInput={(event) => setName(event.currentTarget.value)}
            />
          </div>
          {isTerms && (
            <div class="field">
              <label for="term-kind">类别</label>
              <select
                id="term-kind"
                value={termKind()}
                onChange={(event) => setTermKind(event.currentTarget.value)}
              >
                <option value="topic">主题</option>
                <option value="tag">标签</option>
              </select>
            </div>
          )}
          <button
            class="primary"
            onClick={submit}
            disabled={busy() || !name().trim()}
          >
            新增
          </button>
        </div>
        <div class="list">
          <For each={taxonomyItems()}>
            {(item) => (
              <div class="item taxonomy-row">
                <div>
                  <strong>{item.name}</strong>
                  {item.kind && (
                    <span class="muted">
                      {" "}
                      {item.kind === "topic" ? "主题" : "标签"}
                    </span>
                  )}
                </div>
                <button onClick={() => rename(item)} disabled={busy()}>
                  重命名
                </button>
              </div>
            )}
          </For>
        </div>
      </main>
    </div>
  );
};
render(() => <App />, document.getElementById("app")!);
