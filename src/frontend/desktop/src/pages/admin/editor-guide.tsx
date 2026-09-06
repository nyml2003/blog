import { createSignal, For, onCleanup, Show } from "solid-js";
import { render } from "solid-js/web";
import { Header } from "../../app";

type GuidePageId = "start" | "format" | "validation" | "publishing";

interface GuideSection {
  title: string;
  body: string;
  points: readonly string[];
}

interface GuideExample {
  label: string;
  source: string;
}

interface GuidePage {
  id: GuidePageId;
  tab: string;
  kicker: string;
  title: string;
  intro: string;
  sections: readonly GuideSection[];
  example: GuideExample | undefined;
}

const starterSource = `<h2>问题背景</h2>
<p>说明遇到的现象、使用环境和预期结果。</p>

<h2>解决步骤</h2>
<ol>
  <li>记录输入和错误信息。</li>
  <li>缩小问题范围。</li>
  <li>执行修复并重新验证。</li>
</ol>

<h2>验证结果</h2>
<p>记录实际运行的命令和观察到的结果。</p>`;

const formatSource = `<h2>配置说明</h2>
<p>正文可以使用 <code>行内代码</code> 标记命令或文件名。</p>

<h3>执行步骤</h3>
<ul>
  <li>先检查当前状态。</li>
  <li>再运行目标命令。</li>
</ul>

<pre><code>cargo test --workspace
pnpm --dir src/frontend build</code></pre>

<blockquote><p>引用块适合放限制、结论或需要特别留意的信息。</p></blockquote>

<table>
  <thead><tr><th>检查项</th><th>结果</th></tr></thead>
  <tbody><tr><td>构建</td><td>通过</td></tr></tbody>
</table>

<p><a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">外部参考资料</a></p>`;

const guidePages: readonly GuidePage[] = [
  {
    id: "start",
    tab: "快速开始",
    kicker: "START HERE",
    title: "写出第一篇文章",
    intro:
      "编辑器左侧填写文章信息，中间编写 HTML 源码，右侧同步显示最终正文。先保存草稿，再确认校验通过后发布。",
    sections: [
      {
        title: "1. 填写基本信息",
        body: "标题和文章类型是保存所需的信息；摘要和主题/标签用于帮助读者判断文章内容。",
        points: [
          "标题写清楚具体问题或结论。",
          "摘要用一两句话说明文章解决什么问题。",
          "选择最贴近正文的类型和主题，不必把所有标签都选上。",
        ],
      },
      {
        title: "2. 编写正文片段",
        body: "正文编辑器接收 HTML 片段。直接从标题或段落开始，不要写 doctype、html、head 或 body 外壳。",
        points: [
          "用 h2 表示主要章节，h3 表示章节内的小节。",
          "普通文字放进 p，步骤放进 ol，平行要点放进 ul。",
          "编辑时看右侧预览；停顿片刻后，下方会显示校验结果。",
        ],
      },
      {
        title: "3. 保存与发布",
        body: "保存只更新草稿；保存并发布会让文章进入公共阅读端。正文未通过校验时仍可保存草稿，但不能发布。",
        points: [
          "长内容先多次保存草稿，避免一次写完再保存。",
          "看到“正文校验通过”后，再检查预览并发布。",
          "当前没有自动保存，离开编辑器前要主动保存。",
        ],
      },
    ],
    example: { label: "最小文章模板", source: starterSource },
  },
  {
    id: "format",
    tab: "正文格式",
    kicker: "HTML PROFILE",
    title: "使用系统支持的正文格式",
    intro:
      "文章只保存语义化 HTML，字体、颜色、间距和代码样式由 Desktop 与 Mobile 主题统一处理。",
    sections: [
      {
        title: "常用结构",
        body: "日常写作主要使用标题、段落、列表和代码。每个开始标签都要有对应的结束标签。",
        points: [
          "章节：h2、h3。正文：p。",
          "列表：ul 或 ol，内部项目必须使用 li。",
          "代码：短代码用 code，代码块用 pre 包住 code。",
          "补充内容：blockquote、table、thead、tbody、tr、th、td。",
        ],
      },
      {
        title: "链接写法",
        body: "链接只允许 http 或 https 地址，并且必须同时写出安全的新窗口属性。",
        points: [
          '完整格式是 a href、target="_blank"、rel="noopener noreferrer"。',
          "编辑器不会自动补齐缺少的属性，缺失时会给出诊断。",
        ],
      },
      {
        title: "当前不支持",
        body: "正文不能自带视觉样式或可执行内容。这能保证同一篇文章在不同终端稳定阅读。",
        points: [
          "不要使用 img、script、iframe、form、style 或完整 HTML 文档。",
          "不要添加 class、id、style、data-*、aria-* 或 onclick 等事件属性。",
          "不要依赖浏览器自动补全错误嵌套；所有标签必须正确闭合。",
        ],
      },
    ],
    example: { label: "完整格式示例", source: formatSource },
  },
  {
    id: "validation",
    tab: "校验与预览",
    kicker: "FEEDBACK",
    title: "读懂诊断和实时预览",
    intro:
      "预览帮助你检查阅读效果，校验决定正文是否符合发布规则。两者用途不同，修改源码后都会自动更新。",
    sections: [
      {
        title: "校验状态",
        body: "停止输入后，编辑器会调用与后端同源的 Rust/WASM 规则检查当前正文。",
        points: [
          "“正在校验正文”表示新结果尚未返回。",
          "“正文校验通过”表示当前版本可以进入发布流程。",
          "“正文校验未通过”下面会列出错误位置、原因和稳定错误码。",
        ],
      },
      {
        title: "定位并修复错误",
        body: "点击诊断中的行列位置，编辑器会聚焦并选中对应源码。先修第一个结构错误，后续错误可能随之消失。",
        points: [
          "HTML_UNSUPPORTED_* 通常表示标签、属性或嵌套不在允许范围。",
          "HTML_MISMATCHED_TAG 或 HTML_UNEXPECTED_EOF 通常表示结束标签缺失或不匹配。",
          "链接相关错误应检查地址协议以及 target、rel 属性。",
        ],
      },
      {
        title: "预览的作用",
        body: "右侧预览按系统正文主题渲染当前源码，用来检查标题层级、段落节奏、代码块和表格是否容易阅读。",
        points: [
          "预览更新有短暂防抖，快速输入时不会每个字符都重绘。",
          "预览看起来正常不代表源码一定合法，最终以校验状态为准。",
          "Desktop 与 Mobile 会使用各自主题，正文不要硬编码视觉样式。",
        ],
      },
    ],
    example: undefined,
  },
  {
    id: "publishing",
    tab: "保存与发布",
    kicker: "WORKFLOW",
    title: "选择正确的保存动作",
    intro:
      "草稿和已发布文章使用同一个编辑器。按钮会根据文章状态变化，但正文校验规则始终一致。",
    sections: [
      {
        title: "保存",
        body: "把当前内容写入草稿。即使正文还有诊断，也可以先保存，之后继续修改。",
        points: [
          "适合阶段性保存和保留未完成内容。",
          "保存成功后，新文章地址会带上文章 ID。",
          "保存请求期间表单和编辑器暂时只读，完成后恢复。",
        ],
      },
      {
        title: "保存并发布",
        body: "先保存当前内容，再将文章设为已发布。只有当前正文校验通过时按钮才可用。",
        points: [
          "发布前检查标题、摘要、类型、标签和右侧预览。",
          "发布成功后，文章会按后端可见性规则出现在公共页面。",
          "服务端再次执行权威校验，前端通过不等于绕过后端检查。",
        ],
      },
      {
        title: "取消发布",
        body: "已发布文章会显示“取消发布”。执行后文章回到草稿状态，可继续编辑和再次发布。",
        points: [
          "取消发布不会删除文章。",
          "指南页面始终是前端静态内容，不属于文章，也不会出现在列表中。",
        ],
      },
    ],
    example: undefined,
  },
];

function isGuidePageId(value: string): value is GuidePageId {
  return guidePages.some((page) => page.id === value);
}

function initialPageId(): GuidePageId {
  const hash = location.hash.slice(1);
  return isGuidePageId(hash) ? hash : "start";
}

function EditorGuide() {
  const [activeId, setActiveId] = createSignal<GuidePageId>(initialPageId());
  const [copied, setCopied] = createSignal(false);
  let copiedTimer: number | undefined;
  const activePage = () =>
    guidePages.find((page) => page.id === activeId()) ?? guidePages[0];
  const selectPage = (id: GuidePageId, focus = false) => {
    setActiveId(id);
    setCopied(false);
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
  const copyExample = async (source: string) => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      if (copiedTimer !== undefined) window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  onCleanup(() => {
    if (copiedTimer !== undefined) window.clearTimeout(copiedTimer);
  });

  return (
    <div class="shell">
      <Header admin />
      <main id="main" class="admin-page editor-guide-page">
        <header class="admin-page-head">
          <div>
            <p class="eyebrow">EDITOR HANDBOOK</p>
            <h1>编辑器使用指南</h1>
            <p>按当前正文规范整理的静态说明和可直接使用的 HTML 示例。</p>
          </div>
          <div class="actions">
            <a class="button primary" href="/admin/articles/new.html">
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
            <p>{activePage().intro}</p>
          </header>

          <div class="guide-content">
            <div class="guide-prose">
              <For each={activePage().sections}>
                {(section) => (
                  <section>
                    <h3>{section.title}</h3>
                    <p>{section.body}</p>
                    <ul>
                      <For each={section.points}>
                        {(point) => <li>{point}</li>}
                      </For>
                    </ul>
                  </section>
                )}
              </For>
            </div>

            <Show when={activePage().example}>
              {(example) => (
                <aside class="guide-example" aria-label={example().label}>
                  <div class="guide-example-head">
                    <div>
                      <span>可复制示例</span>
                      <strong>{example().label}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyExample(example().source)}
                    >
                      {copied() ? "已复制" : "复制源码"}
                    </button>
                  </div>
                  <pre>
                    <code>{example().source}</code>
                  </pre>
                </aside>
              )}
            </Show>
          </div>
        </article>
      </main>
    </div>
  );
}

render(() => <EditorGuide />, document.getElementById("app")!);
