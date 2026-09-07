import { createSignal, For } from "solid-js";
import { definePage } from "../../../../solid/page";
import {
  adminTaxonomyErrorMessage,
  type AdminTaxonomyItem,
  useAdminTaxonomy,
} from "../../../../solid/queries";
import { Header, Status } from "../../app";

const isTerms = location.pathname.includes("terms");
const taxonomyKind = isTerms ? "terms" : "types";
const App = () => {
  const items = useAdminTaxonomy(() => taxonomyKind);
  const [name, setName] = createSignal(""),
    [termKind, setTermKind] = createSignal("tag"),
    [busy, setBusy] = createSignal(false),
    [message, setMessage] = createSignal(""),
    [error, setError] = createSignal("");
  const submit = async () => {
    if (!name().trim()) return;
    setBusy(true);
    setError("");
    const result = await items.createItem(
      name(),
      termKind() === "topic" ? "topic" : "tag",
    );
    if (!result.ok) {
      setError(adminTaxonomyErrorMessage(result.error));
      setBusy(false);
      return;
    }
    setName("");
    setMessage("已创建");
    setBusy(false);
  };
  const rename = async (item: AdminTaxonomyItem) => {
    const next = prompt("新的名称", item.name)?.trim();
    if (!next || next === item.name) return;
    setBusy(true);
    setError("");
    const result = await items.renameItem(item, next);
    if (!result.ok) {
      setError(adminTaxonomyErrorMessage(result.error));
      setBusy(false);
      return;
    }
    setMessage("名称已更新");
    setBusy(false);
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
                  {"kind" in item && (
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
definePage(App);
