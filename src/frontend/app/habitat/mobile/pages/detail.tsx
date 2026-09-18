import { For, Show, onMount, type Component } from "solid-js";
import type { MobilePageContext } from "../context";
import { route } from "../context";
import { useMobileResource } from "../resource";
import { ArticleBody } from "../components";
import { Heading, Link, StateMessage, Tag, Text } from "../ui";

function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function createMobileDetailPage(context: MobilePageContext): Component {
  return function MobileDetailPage() {
    const rawId = new URLSearchParams(context.navigation.current().search).get(
      "id",
    );
    const id =
      rawId !== null && /^\d+$/.test(rawId) ? Number(rawId) : undefined;
    const resource = useMobileResource(() =>
      context.api.article.getPublished(id ?? 0),
    );
    if (id === undefined || !Number.isSafeInteger(id) || id <= 0) {
      return <DetailError retry={undefined} />;
    }
    onMount(() => void resource.start());
    const article = () => resource.state().snapshot;
    const articleListHref = route(context.routes, "mobile-articles");
    const goBack = (event: MouseEvent) => {
      const current = context.navigation.current();
      if (current.state && current.pathname === articleListHref) {
        event.preventDefault();
        context.navigation.back();
      }
    };
    return (
      <div class="mobile-shell">
        <header class="reading-bar">
          <Link
            content="← 文章库"
            href={articleListHref}
            options={{ onClick: goBack }}
          />
          <span>阅读</span>
        </header>
        <main id="main" class="mobile-main detail-main">
          <Show
            when={resource.state().status !== "loading"}
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
              fallback={<DetailError retry={() => void resource.refetch()} />}
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
                  <footer class="detail-footer">
                    <Link
                      content="← 返回文章库"
                      href={articleListHref}
                      options={{ onClick: goBack }}
                    />
                  </footer>
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
    <div class="mobile-shell">
      <main id="main" class="mobile-main detail-main">
        <StateMessage
          kind="error"
          text="文章不存在或暂不可见"
          onRetry={props.retry}
        />
      </main>
    </div>
  );
}
