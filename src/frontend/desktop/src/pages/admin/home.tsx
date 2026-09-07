import { createSignal, Show } from "solid-js";
import { definePage } from "../../../../solid/page";
import {
  generateRecommendations,
  useAdminArticles,
} from "../../../../solid/queries";
import { AdminArticleTable, Header, Status } from "../../app";

const App = () => {
  const d = useAdminArticles();
  const [busy, setBusy] = createSignal(false),
    [msg, setMsg] = createSignal("");
  const generate = async () => {
    setBusy(true);
    try {
      const result = await generateRecommendations();
      if (!result.ok) throw new Error(result.error.kind);
      setMsg("推荐已更新");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page">
        <div class="admin-page-head">
          <div>
            <p class="eyebrow">CONTENT WORKSPACE</p>
            <h1>文章管理</h1>
            <p>维护草稿、发布状态和前台推荐内容。</p>
          </div>
          <div class="actions">
            <button onClick={generate} disabled={busy()}>
              生成推荐
            </button>
            <a class="button primary" href="/admin/articles/new.html">
              新建文章
            </a>
          </div>
        </div>
        <Status busy={busy()} ok={msg()} />
        <Show when={d.snapshot()} fallback={<div class="state">加载中...</div>}>
          <AdminArticleTable items={d.snapshot()?.items || []} />
        </Show>
      </main>
    </div>
  );
};
definePage(App);
