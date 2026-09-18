import { For, Show, createEffect, createSignal } from "solid-js";
import { Button, Field, StateMessage } from "../../../../desktop-ui";
import { definePage } from "../../../../solid/page";
import {
  abandonContentTaxonomy,
  adminQueryErrorMessage,
  analyzeContentTaxonomy,
  contentAnalysisArticleIds,
  previewContentTaxonomy,
  reviewContentTaxonomy,
  saveContentTaxonomy,
  submitContentTaxonomy,
  synchronizeContent,
  useContentSyncStatus,
  useContentWorkspace,
  formatTaxonomySource,
  parseTaxonomySource,
  type ContentWorkspace,
  type ContentPreview,
  type ContentSyncStatus,
  type QueryResult,
} from "../../../../solid/queries";
import { Header, Status } from "../../shell";
import {
  canAbandonWorkspace,
  canSubmitWorkspace,
  syncArticleCount,
  syncCommit,
  syncFailureMessage,
  syncLastSuccessCommit,
  syncStatusLabel,
  workspaceActionPending,
  workspaceStatusLabel,
} from "./taxonomy-state";

const App = () => {
  const workspace = useContentWorkspace();
  const syncStatusResource = useContentSyncStatus();
  const [source, setSource] = createSignal("");
  const [version, setVersion] = createSignal(0);
  const [dirty, setDirty] = createSignal(false);
  const [selectedArticleIds, setSelectedArticleIds] = createSignal<number[]>(
    [],
  );
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const [preview, setPreview] = createSignal<ContentPreview>();
  const [latestSyncStatus, setLatestSyncStatus] =
    createSignal<ContentSyncStatus>();
  const workspaceReady = () => workspace.snapshot() !== undefined;
  const workspacePending = () => {
    const status = workspace.snapshot()?.status;
    return status !== undefined && workspaceActionPending(status);
  };
  const syncStatus = () => latestSyncStatus() ?? syncStatusResource.snapshot();
  const syncPending = () =>
    syncStatusResource.loading() || syncStatus()?.status === "running";
  const actionState = (disabled: boolean) => {
    if (busy()) return "loading" as const;
    return disabled ? ("disabled" as const) : ("enabled" as const);
  };

  createEffect(() => {
    const value = workspace.snapshot();
    if (value === undefined || dirty()) return;
    if (value.version !== version()) setPreview(undefined);
    setSource(formatTaxonomySource(value.taxonomy));
    setVersion(value.version);
  });

  createEffect(() => {
    const value = syncStatusResource.snapshot();
    if (value !== undefined) setLatestSyncStatus(value);
  });

  const finishWorkspaceAction = async (
    action: () => Promise<QueryResult<ContentWorkspace>>,
    successMessage: string,
  ) => {
    if (!workspaceReady()) return;
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(undefined);
    const result = await action();
    if (!result.ok) {
      setError(adminQueryErrorMessage(result.error));
      setBusy(false);
      return;
    }
    setSource(formatTaxonomySource(result.value.taxonomy));
    setVersion(result.value.version);
    setDirty(false);
    setMessage(successMessage);
    setBusy(false);
  };
  const save = () => {
    if (!workspaceReady()) return;
    const parsed = parseTaxonomySource(source());
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    void finishWorkspaceAction(
      () => saveContentTaxonomy(version(), parsed.value),
      "taxonomy 已保存到工作区",
    );
  };
  const analyze = () =>
    void finishWorkspaceAction(
      () =>
        analyzeContentTaxonomy(
          version(),
          contentAnalysisArticleIds(
            selectedArticleIds(),
            workspace.snapshot()?.articles ?? [],
          ),
        ),
      "模型分析已应用，请检查预览",
    );
  const review = () =>
    void finishWorkspaceAction(
      () => reviewContentTaxonomy(version()),
      "一次复核已完成",
    );
  const submit = () =>
    void finishWorkspaceAction(
      () => submitContentTaxonomy(version()),
      "批次已提交到唯一活跃 PR",
    );
  const abandon = () => {
    const confirmed = window.confirm(
      "确定放弃当前待提交批次？工作区内尚未提交的分类与文章修改都会丢失。",
    );
    if (!confirmed) return;
    void finishWorkspaceAction(
      () => abandonContentTaxonomy(version()),
      "已放弃待提交批次，公共内容未改变",
    );
  };
  const synchronize = async () => {
    if (!workspaceReady() || busy() || workspacePending() || syncPending())
      return;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await synchronizeContent();
    if (!result.ok) {
      setError(adminQueryErrorMessage(result.error));
      setBusy(false);
      return;
    }
    setLatestSyncStatus(result.value);
    if (result.value.status === "failed") {
      setError(result.value.message);
    } else if (result.value.status === "running") {
      setMessage("同步已开始");
    } else {
      setMessage("内容仓库同步完成");
    }
    setBusy(false);
    void workspace.refetch();
  };
  const loadPreview = async () => {
    if (!workspaceReady()) return;
    setBusy(true);
    setError("");
    const result = await previewContentTaxonomy();
    if (!result.ok) {
      setError(adminQueryErrorMessage(result.error));
      setBusy(false);
      return;
    }
    if (result.value.version !== version()) {
      setError("工作区版本已变化，请刷新后重新预览");
      setPreview(undefined);
      setBusy(false);
      void workspace.refetch();
      return;
    }
    setPreview(result.value);
    setMessage("预览已刷新");
    setBusy(false);
  };
  const toggleArticle = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedArticleIds((current) => [...current, id]);
      return;
    }
    setSelectedArticleIds((current) =>
      current.filter((articleId) => articleId !== id),
    );
  };

  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page taxonomy-page">
        <header class="admin-page-head taxonomy-workbench-head">
          <div>
            <p class="eyebrow">CONTENT WORKSPACE</p>
            <h1>分类树与发布批次</h1>
            <p>保存只进入工作区；分析、复核与文章迁移在提交前统一预览。</p>
          </div>
          <Show when={workspace.snapshot()}>
            {(value) => (
              <dl class="workspace-summary">
                <div>
                  <dt>版本</dt>
                  <dd>{value().version}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{workspaceStatusLabel(value().status)}</dd>
                </div>
                <div>
                  <dt>文章</dt>
                  <dd>{value().articles.length}</dd>
                </div>
                <Show when={value().pullRequest}>
                  {(pullRequest) => (
                    <>
                      <div>
                        <dt>活跃 PR</dt>
                        <dd>#{pullRequest().number}</dd>
                      </div>
                      <div>
                        <dt>分支</dt>
                        <dd>{pullRequest().branch}</dd>
                      </div>
                      <div>
                        <dt>提交</dt>
                        <dd>{pullRequest().commit}</dd>
                      </div>
                    </>
                  )}
                </Show>
              </dl>
            )}
          </Show>
        </header>
        <Status
          busy={busy() || workspace.loading()}
          error={
            error() ||
            (workspace.error() && workspace.snapshot() === undefined
              ? "工作区加载失败"
              : "")
          }
          ok={message()}
        />
        <Show when={workspace.snapshot()?.lastError}>
          {(lastError) => (
            <StateMessage
              content={`上次工作区操作失败：${lastError()}`}
              kind="error"
            />
          )}
        </Show>
        <div class="taxonomy-workbench-grid">
          <section
            class="taxonomy-editor"
            aria-labelledby="taxonomy-editor-title"
          >
            <header>
              <h2 id="taxonomy-editor-title">taxonomy.json</h2>
              <span>
                {dirty() ? "有未保存修改" : `工作区版本 ${version()}`}
              </span>
            </header>
            <Field
              control={
                <textarea
                  id="taxonomy-source"
                  rows="24"
                  spellcheck={false}
                  disabled={!workspaceReady() || busy() || workspacePending()}
                  value={source()}
                  onInput={(event) => {
                    setSource(event.currentTarget.value);
                    setDirty(true);
                  }}
                />
              }
              controlId="taxonomy-source"
              label="分类树与标签 JSON"
            />
            <Button
              content="保存到工作区"
              options={{
                onClick: save,
                state: actionState(!workspaceReady() || workspacePending()),
                type: "button",
                variant: "primary",
              }}
            />
          </section>
          <aside class="taxonomy-batch" aria-labelledby="taxonomy-batch-title">
            <h2 id="taxonomy-batch-title">文章分类分析</h2>
            <p class="muted">未选择文章时分析当前工作区全部文章。</p>
            <fieldset
              disabled={!workspaceReady() || busy() || workspacePending()}
            >
              <legend>限定文章</legend>
              <div class="taxonomy-article-picker">
                <For each={workspace.snapshot()?.articles ?? []}>
                  {(article) => (
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedArticleIds().includes(article.id)}
                        onChange={(event) =>
                          toggleArticle(article.id, event.currentTarget.checked)
                        }
                      />
                      <span>{article.title}</span>
                    </label>
                  )}
                </For>
              </div>
            </fieldset>
            <div class="taxonomy-batch-actions">
              <Button
                content="分析并应用"
                options={{
                  onClick: analyze,
                  state: actionState(
                    !workspaceReady() || workspacePending() || dirty(),
                  ),
                }}
              />
              <Button
                content="复核一次"
                options={{
                  onClick: review,
                  state: actionState(
                    !workspaceReady() || workspacePending() || dirty(),
                  ),
                }}
              />
              <Button
                content="刷新预览"
                options={{
                  onClick: () => void loadPreview(),
                  state: actionState(
                    !workspaceReady() || workspacePending() || dirty(),
                  ),
                }}
              />
              <Button
                content="提交 PR"
                options={{
                  onClick: submit,
                  state: actionState(
                    !workspaceReady() ||
                      workspacePending() ||
                      dirty() ||
                      !canSubmitWorkspace(
                        workspace.snapshot()?.status ?? "clean",
                      ),
                  ),
                  variant: "primary",
                }}
              />
              <Button
                content="放弃批次"
                options={{
                  onClick: abandon,
                  state: actionState(
                    !workspaceReady() ||
                      !canAbandonWorkspace(
                        workspace.snapshot()?.status ?? "clean",
                      ),
                  ),
                }}
              />
              <Button
                content={syncPending() ? "同步中..." : "同步内容仓库"}
                options={{
                  onClick: () => void synchronize(),
                  state: actionState(
                    !workspaceReady() ||
                      workspacePending() ||
                      dirty() ||
                      syncPending(),
                  ),
                }}
              />
            </div>
            <Show when={syncStatus()}>
              {(status) => (
                <dl class="workspace-summary taxonomy-sync-status">
                  <div>
                    <dt>同步状态</dt>
                    <dd>{syncStatusLabel(status().status)}</dd>
                  </div>
                  <Show when={syncCommit(status())}>
                    {(commit) => (
                      <div>
                        <dt>远端提交</dt>
                        <dd>{commit()}</dd>
                      </div>
                    )}
                  </Show>
                  <Show when={syncArticleCount(status())}>
                    {(articleCount) => (
                      <div>
                        <dt>文章</dt>
                        <dd>{articleCount()}</dd>
                      </div>
                    )}
                  </Show>
                  <Show when={syncFailureMessage(status())}>
                    {(failure) => (
                      <div>
                        <dt>失败原因</dt>
                        <dd>{failure()}</dd>
                      </div>
                    )}
                  </Show>
                  <Show when={syncLastSuccessCommit(status())}>
                    {(lastSuccessCommit) => (
                      <div>
                        <dt>上次成功</dt>
                        <dd>{lastSuccessCommit()}</dd>
                      </div>
                    )}
                  </Show>
                </dl>
              )}
            </Show>
          </aside>
        </div>
        <Show when={workspaceReady() ? preview() : undefined}>
          {(value) => (
            <section
              class="taxonomy-preview"
              aria-labelledby="taxonomy-preview-title"
            >
              <header>
                <div>
                  <p class="eyebrow">BATCH DIFF</p>
                  <h2 id="taxonomy-preview-title">
                    提交预览 · v{value().version}
                  </h2>
                </div>
                <span>{value().changedArticles.length} 篇文章受影响</span>
              </header>
              <Show when={value().warnings.length > 0}>
                <ul class="taxonomy-warnings">
                  <For each={value().warnings}>
                    {(warning) => <li>{warning}</li>}
                  </For>
                </ul>
              </Show>
              <pre tabindex="0">{value().diff || "当前没有文件差异"}</pre>
            </section>
          )}
        </Show>
      </main>
    </div>
  );
};

definePage(App);
