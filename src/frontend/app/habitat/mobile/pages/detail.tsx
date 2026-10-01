import { ArrowLeft } from "lucide-solid";
import { For, Show, type Component } from "solid-js";
import { useMobileDetail, type MobileDetailInput } from "../logic/detail";
import { ArticleBody, MobileNav } from "../components";
import { Heading, StateMessage, Tag, Text } from "../ui";
import { displayDate } from "../../route-input";

export function createMobileDetailPage(input: MobileDetailInput): Component {
  return function MobileDetailPage() {
    const detail = useMobileDetail(input);
    const backLink = (
      <a
        class="detail-back"
        href={detail.articleListHref}
        aria-label="返回上一页"
        title="返回上一页"
        onClick={(event) => {
          event.preventDefault();
          detail.onBack();
        }}
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </a>
    );
    if (detail.kind === "invalid") {
      return (
        <div class="mobile-shell">
          <header class="reading-bar">
            {backLink}
            <span>阅读</span>
          </header>
          <main id="main" class="mobile-main detail-main">
            <DetailError retry={undefined} />
          </main>
        </div>
      );
    }
    const payload = () => detail.state().snapshot;
    const article = () => payload()?.article;
    return (
      <div class="mobile-shell">
        <MobileNav
          context={input.context}
          navigation={payload()?.navigation}
          browserNavigation={input.navigation}
          persistence={input.persistence}
          document={input.document}
          share={input.share}
          favoriteKey={article()?.id.toString()}
          onBack={detail.onBack}
        />
        <main id="main" class="mobile-main detail-main">
          <Show
            when={detail.state().status !== "loading"}
            fallback={
              <StateMessage
                kind="loading"
                text="正在加载文章…"
                onRetry={undefined}
              />
            }
          >
            <Show
              when={article()}
              fallback={<DetailError retry={detail.retry} />}
            >
              {(value) => (
                <article class="mobile-article">
                  <header class="detail-header">
                    <Text
                      content={value().articleType?.name ?? "文章"}
                      options={{ tone: "accent", size: "meta" }}
                    />
                    <Heading
                      content={value().title}
                      options={{ as: "h1", size: "page" }}
                    />
                    <Show when={value().summary}>
                      <Text
                        content={value().summary}
                        options={{ as: "p", tone: "muted", size: "body" }}
                      />
                    </Show>
                    <p class="detail-meta">
                      <For each={value().terms?.slice(0, 2) ?? []}>
                        {(term) => <Tag content={term.name} options={{}} />}
                      </For>
                      <time dateTime={value().updatedAt}>
                        更新于 {displayDate(value().updatedAt)}
                      </time>
                    </p>
                  </header>
                  <ArticleBody html={value().contentHtml} />
                </article>
              )}
            </Show>
          </Show>
        </main>
      </div>
    );
  };
}

function DetailError(props: { readonly retry: (() => void) | undefined }) {
  return (
    <StateMessage
      kind="error"
      text="文章不存在或暂不可见"
      onRetry={props.retry}
    />
  );
}
