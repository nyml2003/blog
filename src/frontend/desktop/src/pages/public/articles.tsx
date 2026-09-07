import { createSignal } from "solid-js";
import { definePage } from "../../../../solid/page";
import {
  tShelfFilterFromSearch,
  tShelfSearch,
  useTShelf,
} from "../../../../solid/queries";
import { Header, TShelf } from "../../app";

const App = () => {
  const [selection, setSelection] = createSignal({
    surface: "archive" as const,
    filterId: tShelfFilterFromSearch(location.search),
  });
  const data = useTShelf(selection);
  const selectFilter = (filterId: string) => {
    setSelection({ surface: "archive", filterId });
    history.replaceState(
      {},
      "",
      `${location.pathname}${tShelfSearch(filterId)}`,
    );
  };
  return (
    <div class="shell">
      <Header />
      <main id="main">
        <header class="page-title">
          <p class="eyebrow">ARCHIVE</p>
          <h1>全部文章</h1>
          <p>按文章类型浏览已经发布的技术记录。</p>
        </header>
        <TShelf
          filters={data.filters()}
          selectedFilterId={selection().filterId}
          articles={data.snapshot()?.articles ?? []}
          total={data.snapshot()?.total}
          loading={data.loading()}
          error={data.error() !== undefined}
          variant="archive"
          onSelect={selectFilter}
          onRetry={() => void data.refetch()}
        />
      </main>
    </div>
  );
};
definePage(App);
