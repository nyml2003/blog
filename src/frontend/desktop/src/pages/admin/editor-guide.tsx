import { createSignal, For, Show } from "solid-js";
import { definePage } from "../../../../solid/page";
import { Header } from "../../shell";
import { ArticleSourceEditor } from "./article-source-editor";
import {
  adminArticleNewHref,
  useHtmlInspection,
} from "../../../../solid/queries";

type GuidePageId = "start" | "format" | "validation" | "publishing";
type GuidePage = {
  id: GuidePageId;
  tab: string;
  kicker: string;
  title: string;
  source: string;
};

export const guidePages: readonly GuidePage[] = [
  {
    id: "start",
    tab: "快速开始",
    kicker: "START HERE",
    title: "写出第一篇文章",
    source: `<h2>1. 填写基本信息</h2>
<p>标题是保存所需的信息。分类、标签和摘要帮助读者判断文章内容。</p>
<ul>
  <li>标题写清楚具体问题或结论。</li>
  <li>摘要用一两句话说明文章解决什么问题。</li>
  <li>选择最贴近正文的分类和标签，不必把所有标签都选上。</li>
</ul>

<h2>2. 编写正文片段</h2>
<p>正文从标题或段落开始，不要写 doctype、html、head 或 body 外壳。</p>
<ol>
  <li>用 h2 表示主要章节，h3 表示章节内的小节。</li>
  <li>普通文字放进 p，步骤放进 ol，平行要点放进 ul。</li>
  <li>编辑时看右侧简版预览，停顿片刻后查看校验结果。</li>
</ol>

<h2>3. 保存文章</h2>
<p>当前没有自动保存。长内容应多次保存到待提交批次，离开编辑器前主动保存。</p>`,
  },
  {
    id: "format",
    tab: "正文格式",
    kicker: "HTML PROFILE",
    title: "使用系统支持的正文格式",
    source: `<h2>常用结构</h2>
<p>正文只保存语义化 HTML，字体、颜色、间距和代码样式由 Desktop 与 Mobile 主题统一处理。</p>
<ul>
  <li>章节使用 h2、h3，正文使用 p。</li>
  <li>列表使用 ul 或 ol，内部项目必须使用 li。</li>
  <li>短代码使用 code，代码块使用 pre 包住 code。</li>
</ul>

<h2>链接写法</h2>
<p>链接只允许 http 或 https 地址，并且必须同时写出安全的新窗口属性。</p>
<pre><code>&lt;a href="https://example.com/docs" target="_blank" rel="noopener noreferrer"&gt;参考资料&lt;/a&gt;</code></pre>

<h2>不支持的内容</h2>
<p>不要写完整 HTML 文档，不要使用 script、iframe、form、style、class、id、style 或事件属性。</p>`,
  },
  {
    id: "validation",
    tab: "校验与预览",
    kicker: "FEEDBACK",
    title: "读懂校验和预览",
    source: `<h2>校验状态</h2>
<p>停止输入后，编辑器使用同一份 Rust/WASM 规则检查当前正文。</p>
<ul>
  <li>正在校验表示新结果尚未返回。</li>
  <li>正文校验通过表示当前内容可以进入发布流程。</li>
  <li>正文校验未通过会列出错误位置、原因和稳定错误码。</li>
</ul>

<h2>定位并修复错误</h2>
<p>点击诊断中的行列位置，编辑器会聚焦并选中对应源码。先修第一个结构错误，后续错误可能随之消失。</p>

<h2>简版预览</h2>
<p>右侧简版预览用来检查标题层级、段落节奏、代码块和表格。它会渲染当前输入，但不是发布门禁。</p>`,
  },
  {
    id: "publishing",
    tab: "保存与发布",
    kicker: "WORKFLOW",
    title: "保存、预览与提交",
    source: `<h2>保存到待提交批次</h2>
<p>保存只更新当前工作区，不会直接改变公共阅读端。正文未通过校验时不会写入，当前输入会保留，上次有效保存保持不变。</p>
<ul>
  <li>分类和标签与正文一起保存到同一个工作区版本。</li>
  <li>服务端会再次执行权威校验。</li>
</ul>

<h2>预览并提交</h2>
<p>发布工作台读取已保存的待提交批次，并统一展示文章与 taxonomy 的变化。</p>
<ol>
  <li>先手动保存当前表单和正文。</li>
  <li>前往发布工作台刷新预览并检查差异。</li>
  <li>确认批次内容后再统一提交。</li>
</ol>

<p>文章的公开状态与时间由服务端和工作区提交结果决定，编辑器不会自行推断。</p>`,
  },
];

function isGuidePageId(value: string): value is GuidePageId {
  return guidePages.some((page) => page.id === value);
}
function initialPageId(): GuidePageId {
  const hash = location.hash.slice(1);
  return isGuidePageId(hash) ? hash : "start";
}

function GuideSourceEditor(props: { page: GuidePage }) {
  const [source, setSource] = createSignal(props.page.source);
  const validation = useHtmlInspection(source);
  const error = () => {
    const failure = validation.resource.error();
    return failure !== undefined && "message" in failure ? failure.message : "";
  };
  return (
    <ArticleSourceEditor
      value={source}
      busy={() => false}
      inspection={validation.current}
      pending={() => validation.resource.loading()}
      error={error}
      sourceId={`guide-source-${props.page.id}`}
      diagnosticsId={`guide-diagnostics-${props.page.id}`}
      onChange={setSource}
      retry={() => void validation.resource.refetch()}
    />
  );
}

function EditorGuide() {
  const [activeId, setActiveId] = createSignal<GuidePageId>(initialPageId());
  const activePage = () =>
    guidePages.find((page) => page.id === activeId()) ?? guidePages[0];
  const selectPage = (id: GuidePageId, focus = false) => {
    setActiveId(id);
    history.replaceState(null, "", `#${id}`);
    if (focus) document.getElementById(`guide-tab-${id}`)?.focus();
  };
  const moveTab = (event: KeyboardEvent, currentId: GuidePageId) => {
    const currentIndex = guidePages.findIndex((page) => page.id === currentId);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % guidePages.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + guidePages.length) % guidePages.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = guidePages.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectPage(guidePages[nextIndex].id, true);
  };
  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page editor-guide-page">
        <header class="admin-page-head">
          <div>
            <p class="eyebrow">EDITOR HANDBOOK</p>
            <h1>编辑器使用指南</h1>
            <p>
              每一页都是可直接编辑的 HTML 示例，源码和右侧预览使用同一份内容。
            </p>
          </div>
          <div class="actions">
            <a class="button primary" href={adminArticleNewHref()}>
              开始写作
            </a>
          </div>
        </header>
        <div class="guide-tabs" role="tablist" aria-label="指南章节">
          <For each={guidePages}>
            {(page) => (
              <button
                id={`guide-tab-${page.id}`}
                type="button"
                role="tab"
                aria-selected={activeId() === page.id}
                aria-controls={`guide-panel-${page.id}`}
                tabIndex={activeId() === page.id ? 0 : -1}
                onClick={() => selectPage(page.id)}
                onKeyDown={(event) => moveTab(event, page.id)}
              >
                {page.tab}
              </button>
            )}
          </For>
        </div>
        <article
          id={`guide-panel-${activePage().id}`}
          class="guide-panel"
          role="tabpanel"
          aria-labelledby={`guide-tab-${activePage().id}`}
          tabIndex={0}
        >
          <header class="guide-heading">
            <p class="eyebrow">{activePage().kicker}</p>
            <h2>{activePage().title}</h2>
            <p>
              直接修改左侧 HTML
              练习。切换到其他页签后，本页内容会恢复为初始示例。
            </p>
          </header>
          <Show when={activePage()} keyed>
            {(page) => <GuideSourceEditor page={page} />}
          </Show>
        </article>
      </main>
    </div>
  );
}

definePage(EditorGuide);
