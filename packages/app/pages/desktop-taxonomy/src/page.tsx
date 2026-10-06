import { For, Show, type Component } from "solid-js";
import { Button, Field, Heading, Text, Textarea } from "@blog/desktop-atoms";
import type { DesktopPageContext } from "@blog/desktop-shared";
import { useDesktopTaxonomy } from "./feature";
import "./page.css";

export function createDesktopTaxonomyPage(
  input: DesktopPageContext,
): Component {
  return function DesktopTaxonomyPage() {
    const page = useDesktopTaxonomy(input.api, input.dialog);
    const state = () => page.current();
    return (
      <div class="admin-page desktop-taxonomy">
        <header class="admin-page-head">
            <Text tone="accent">CONTENT WORKSPACE</Text>
            <Heading level={1}>分类树与发布批次</Heading>
            <Text tone="muted">
              保存只进入工作区；分析、复核与提交在这里统一完成。
            </Text>
          </header>
          <Show when={page.message()}>
            <Text role="status" tone="muted">
              {page.message()}
            </Text>
          </Show>
          <Show when={page.error()}>
            <Text role="alert" tone="danger">
              {page.error()}
            </Text>
          </Show>
          <Show when={state()} fallback={<p>工作区加载中...</p>}>
            {(value) => (
              <>
                <p>
                  版本 {value().version} · {value().articles.length} 篇文章
                </p>
                <Field label="分类树与标签 JSON">
                  <Textarea
                    rows={24}
                    value={page.source()}
                    onInput={(event) =>
                      page.setSource(event.currentTarget.value)
                    }
                  />
                </Field>
                <div class="taxonomy-actions">
                  <Button onClick={page.save} disabled={page.busy()}>
                    保存到工作区
                  </Button>
                  <Button
                    onClick={page.analyze}
                    disabled={page.busy() || page.dirty()}
                  >
                    分析并应用
                  </Button>
                  <Button
                    onClick={page.review}
                    disabled={page.busy() || page.dirty()}
                  >
                    复核一次
                  </Button>
                  <Button
                    onClick={() => void page.refreshPreview()}
                    disabled={page.busy() || page.dirty()}
                  >
                    刷新预览
                  </Button>
                  <Button
                    onClick={page.submit}
                    disabled={page.busy() || page.dirty()}
                  >
                    提交 PR
                  </Button>
                  <Button onClick={page.abandon} disabled={page.busy()}>
                    放弃批次
                  </Button>
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
      </div>
    );
  };
}
