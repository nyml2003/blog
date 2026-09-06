import { createSignal, Show } from "solid-js";
import { definePage } from "../../../../common/page";
import { browserClient as client } from "../../../../common/client";
import {
  filterFromSearch,
  filterSearch,
} from "../../../../common/logic/filter";
import { useDataResource } from "../../../../solid/data";
import { Filters, Header, Shelf } from "../../app";

const App = () => {
  const [filter, setFilter] = createSignal(filterFromSearch(location.search));
  const data = useDataResource(filter, (value) =>
    client.articleCatalog.listPublishedArticles({
      termIds: value.termIds.map(Number),
      typeId: Number(value.typeId) || undefined,
      createdFrom: value.createdFrom || undefined,
      createdTo: value.createdTo || undefined,
      updatedFrom: value.updatedFrom || undefined,
      updatedTo: value.updatedTo || undefined,
    }),
  );
  const apply = (value: ReturnType<typeof filter>) => {
    setFilter(value);
    const query = filterSearch(value, false);
    history.replaceState(
      {},
      "",
      `${location.pathname}${query.size ? `?${query}` : ""}`,
    );
  };
  return (
    <div class="shell">
      <Header />
      <main id="main">
        <header class="page-title">
          <p class="eyebrow">ARCHIVE</p>
          <h1>全部文章</h1>
          <p>按类型、主题和时间范围查找已经发布的技术记录。</p>
        </header>
        <div class="result-count">{data.snapshot()?.total ?? "--"} 篇记录</div>
        <Filters value={filter()} onChange={apply} />
        <Show
          when={data.status() !== "loading"}
          fallback={<div class="state">加载中...</div>}
        >
          <Show
            when={data.status() !== "error"}
            fallback={
              <div class="error" role="alert">
                文章加载失败，请重试。
              </div>
            }
          >
            <Show
              when={(data.snapshot()?.items.length ?? 0) > 0}
              fallback={
                <div class="state">没有符合条件的文章，请清除筛选后重试。</div>
              }
            >
              <Shelf items={data.snapshot()?.items ?? []} variant="archive" />
            </Show>
          </Show>
        </Show>
      </main>
    </div>
  );
};
definePage(App);
