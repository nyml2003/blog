import { For, Show, type Component } from "solid-js";
import type { DesktopPageContext } from "../../foundation/context";
import { route } from "../../foundation/context";
import { useDesktopTaxonomy } from "../../features/taxonomy/model";

export function createDesktopTaxonomyPage(
  input: DesktopPageContext,
): Component {
  return function DesktopTaxonomyPage() {
    const page = useDesktopTaxonomy(input.api);
    const adminHref = route(input.routes, "desktop-admin-home");
    const state = () => page.current();
    return (
      <div class="desktop-login desktop-taxonomy">
        <header>
          <a class="brand" href={adminHref}>
            <span>管理台</span>
            <strong>技术知识库</strong>
          </a>
          <a href={adminHref}>返回文章管理</a>
        </header>
        <main id="main">
          <header>
            <p class="eyebrow">CONTENT WORKSPACE</p>
            <h1>分类树与发布批次</h1>
            <p>保存只进入工作区；分析、复核与提交在这里统一完成。</p>
          </header>
          <Show when={page.message()}>
            <p role="status">{page.message()}</p>
          </Show>
          <Show when={page.error()}>
            <p role="alert">{page.error()}</p>
          </Show>
          <Show when={state()} fallback={<p>工作区加载中...</p>}>
            {(value) => (
              <>
                <p>
                  版本 {value().version} · {value().articles.length} 篇文章
                </p>
                <label for="taxonomy-source">
                  分类树与标签 JSON
                  <textarea
                    id="taxonomy-source"
                    rows="24"
                    value={page.source()}
                    onInput={(event) =>
                      page.setSource(event.currentTarget.value)
                    }
                  />
                </label>
                <div class="taxonomy-actions">
                  <button
                    type="button"
                    onClick={page.save}
                    disabled={page.busy()}
                  >
                    保存到工作区
                  </button>
                  <button
                    type="button"
                    onClick={page.analyze}
                    disabled={page.busy() || page.dirty()}
                  >
                    分析并应用
                  </button>
                  <button
                    type="button"
                    onClick={page.review}
                    disabled={page.busy() || page.dirty()}
                  >
                    复核一次
                  </button>
                  <button
                    type="button"
                    onClick={() => void page.refreshPreview()}
                    disabled={page.busy() || page.dirty()}
                  >
                    刷新预览
                  </button>
                  <button
                    type="button"
                    onClick={page.submit}
                    disabled={page.busy() || page.dirty()}
                  >
                    提交 PR
                  </button>
                  <button
                    type="button"
                    onClick={page.abandon}
                    disabled={page.busy()}
                  >
                    放弃批次
                  </button>
                </div>
                <Show when={page.preview()}>
                  {(preview) => (
                    <section>
                      <h2>提交预览</h2>
                      <For each={preview().warnings}>
                        {(warning) => <p>{warning}</p>}
                      </For>
                      <pre>{preview().diff || "当前没有文件差异"}</pre>
                    </section>
                  )}
                </Show>
              </>
            )}
          </Show>
        </main>
      </div>
    );
  };
}
