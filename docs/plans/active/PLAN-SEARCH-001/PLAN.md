---
kind: plan
id: PLAN-SEARCH-001
status: ready
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# 全文检索与搜索词高亮

## 目标

为文章库提供真正的文字搜索：支持按标题、摘要、**正文内容**检索，结果列表关键词高亮，并支持从搜索结果进入详情页后的**文内高亮定位**。触发背景：`PLAN-NAV-ACTIONS-001` 的搜索入口需要真实搜索面；现状核实发现所谓"文章检索页"（`mobile-article-list`）只是分类浏览页的标题，产品从未有过文字搜索——本功能从零开始。

## 当前基线（2026-10-01 现场核实）

- 后端公开场景当前为十二个，无任何搜索端点；mobile client 无 `q` 类查询参数；`article-list` 页面仅读 `category_id`。
- 正文以 HTML 存于 SQLite 公开快照，`content_sync` 单事务整体替换；搜索索引若引入，更新必须同事务，不允许异步重建造成不一致窗口。
- 正文 HTML 受校验器白名单约束（`article-html-core` / `SPEC-ARTICLE-HTML-VALIDATION-001`）——**文内高亮不能直接往正文 HTML 注入标记**：要么白名单增加 `<mark>`（契约变更，需明确决策），要么客户端渲染期处理；这是本计划最关键的既有契约接缝。
- SQLite FTS 中文分词是核心技术风险：FTS5 默认分词器不切中文，`trigram` 支持子串匹配但索引体积与精度有取舍，或同步期外部分词。选型必须以实测数据定，不预设。
- 目标服务器 2C2G 40GB（`FACT-RUNTIME-001`）：索引体积、查询延迟、重建事务时长都是容量约束。

## 业界实践调研结论（2026-10-01）

- 浏览器 `Ctrl+F` 由用户代理内部处理：页面脚本不能读取或控制当前查找状态，浏览器也不会向页面 DOM 注入 `<mark>`；高亮和滚动由浏览器自己的查找/绘制层完成。因此不能把 `Ctrl+F` 当作站内搜索的可调用接口。
- 详情页文内高亮的首选实现是 **CSS Custom Highlight API**：客户端仍需通过 `TreeWalker` 和文本映射计算命中的 `Range`，但用 `CSS.highlights` 与 `::highlight()` 绘制，不改变文章 DOM、HTML 校验契约或正文事件结构。该 API 已进入现代浏览器基线，但仍必须特性检测，以兼容旧浏览器和 WebView。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)；[W3C 规范](https://www.w3.org/TR/css-highlight-api-1/)
- 不支持 CSS Custom Highlight API 时，允许在客户端渲染结果上插入临时 `<mark>`/`<span>` 作为回退；回退必须可完整清理，不能把标记写回存储正文、搜索索引或公共 HTML 协议。命中跨越多个 HTML 元素时，匹配逻辑需要基于连续文本映射，而不是只查单个 Text 节点。
- URL Text Fragments（`#:~:text=...`）可以交给浏览器完成文本定位和强调，适合可选的分享链接；它的匹配、滚动和高亮行为由浏览器决定，不能作为站内搜索的唯一高亮协议。[规范](https://wicg.github.io/scroll-to-text-fragment/)
- 结果列表与详情页应分别处理：列表优先使用后端返回的安全摘要和命中范围，详情页根据实际渲染后的 DOM 重新计算范围。不要把带 `<mark>` 的未受信任 HTML 作为跨端协议。

## 组合式能力设计（后续实现落点）

高亮能力不归属某一个文章详情页，也不把完整 DOM 算法复制到 Desktop/Mobile。建议建立独立的 workspace/npm 包 `@fluvient-loom/text-highlight`，采用一个包、两个入口的边界：根入口提供无 DOM 的纯逻辑，`/web` 提供浏览器适配。这里的“npm 包”首先指可独立依赖、测试和版本化的 workspace package，首期保持 `private: true`；是否发布到公共 registry，等 API、浏览器兼容性、文档和版本策略稳定后再单独决策。

独立成包是为了让文章正文、搜索结果、代码阅读器和帮助文档共用同一套能力，同时避免把搜索专用算法塞进通用 `@fluvient/core`，也避免继续扩张已有的通用 `@fluvient-loom/web` 浏览器工具包。首期不拆成两个 npm 包，使用 `exports` 暴露 `.` 与 `./web`，让纯逻辑和浏览器适配保持同版本演进；未来若确有独立发布、依赖或兼容性节奏，再拆包。

1. **纯文本匹配层**：由包根入口 `@fluvient-loom/text-highlight` 提供。输入规范化后的查询词和连续文本，输出不可变的命中区间；不依赖 DOM、Solid、`window` 或 `document`。匹配规则应与后端返回的高亮词/协议保持一致，避免前后端各自解释查询语义。
2. **浏览器高亮适配层**：由同一包的 `@fluvient-loom/text-highlight/web` 子路径提供。对文章根节点建立 Text 节点到连续文本的映射，把纯文本命中区间转换为 `Range`，优先使用 CSS Custom Highlight API，负责清理、命中计数、活动命中切换和滚动到首个命中块；旧浏览器回退到临时节点。该层不修改存储正文，也不暴露带标记的 HTML。
3. **页面组合层**：Desktop/Mobile 各自保留 `ArticleBody` 和页面 DOM，但只接收同一份高亮能力契约与搜索状态（查询词、活动命中序号、是否定位）。正文渲染完成后把根节点交给能力层，页面不自行实现 TreeWalker、Range、匹配和清理。`src/frontend/bootstrap/{desktop,mobile}` 负责创建浏览器适配器并注入页面上下文，`src/frontend/{desktop,mobile}/widgets/article-body` 只负责组合和生命周期管理。

建议的公共契约只描述行为，不暴露 DOM 细节：创建/更新高亮会话、清理会话、返回命中数量、定位指定命中。只有 `@fluvient-loom/text-highlight/web` 知道 `HTMLElement`、`Range` 和 `CSS.highlights`；根入口和类型层不依赖浏览器。若某个场景需要不同的匹配规则，应替换纯文本匹配策略，不复制浏览器适配层。包本身不包含博客文章、后端 API、URL 参数、Solid 组件或 HTML 白名单语义。

实现时应同时补三类测试：纯文本匹配的跨节点/实体/中英文边界测试；浏览器适配器的 Range、回退清理和滚动测试；Desktop/Mobile 组合测试，确认两端只提供根节点和状态，不产生第二套高亮算法。

## 决策闸门（评测与产品输入后确认）

1. **分词与索引方案**：实现方提交 spike 数据（中文/中英混合查询效果、索引体积增量、`content_sync` 事务时长变化）后选定。
2. **搜索范围**：标题、摘要、正文 HTML（剥标签后）、term 名称，哪些进索引。
3. **高亮层次**：
   - 结果列表：后端返回 snippet（含高亮偏移）还是前端本地标记——协议题；
   - 详情页文内高亮：是否本轮纳入；按“纯文本匹配 → 浏览器适配 → 页面组合”三层提供；优先采用 CSS Custom Highlight API，临时 `<mark>`/`<span>` 仅作兼容回退；命中词经 URL 参数传递的方式；多命中滚动定位策略；不得默认开放正文 `<mark>` 白名单。
4. **搜索交互面**：新增独立搜索页（进 `pages.registry`）还是增强现有列表页；空态、无结果、部分匹配的呈现。
5. **与分类筛选的组合语义**（先分类后搜索、互斥还是叠加）。
6. **性能预算**：查询延迟上限、索引体积上限、重建事务时长上限——闸门定值后作为验收线。
7. **Desktop 是否同轮提供**，还是 Mobile 先行。
8. 搜索端点的滥用防护（限速）与缓存策略。

包形态本身已确定为独立 workspace package `@fluvient-loom/text-highlight`，根入口与 `./web` 子路径同版本维护；公共 npm 发布不属于本轮交付闸门，待接口稳定后另行评估。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| FTS 分词方案 spike | backend | - | 评测脚本与数据（本目录留档，不入库大样本） | ready |
| 决策闸门 | 产品+pm | spike 数据 | 本 PLAN.md 范围与预算确认、Spec 立项 | blocked |
| 后端：索引与搜索端点 | backend | 闸门 | `src/backend/data/`（FTS、迁移、事务）、`src/backend/product/`（BFF、端点）、`src/core/protocol/`、Spec、routes golden | blocked by 闸门 |
| 前端：搜索面与高亮 | frontend | 契约冻结 | 搜索页或列表页增强、`pages.registry`、`packages/text-highlight` 独立包、必要时的 `packages/port` 注入契约、`src/frontend/{desktop,mobile}/widgets/article-body` 组合、两端范围以闸门为准 | blocked by 闸门 |
| 验收与收尾 | qa+pm | 实现完成 | E2E、证据、RESULT.md | pending |

## 成功标准

1. 中英文与混合查询按评测口径可用（选型数据支撑，不以个别案例代替）。
2. 搜索端点延迟、索引体积、`content_sync` 事务时长均在闸门预算内，超限即不达标。
3. 结果列表高亮生效；文内高亮若纳入，详情页命中定位有浏览器证据，且正文校验契约的变更（如有）有独立决策记录。
4. 新端点有生效 Spec、scene code、golden 同步、限速防护。
5. E2E 覆盖搜索旅程（输入→结果→高亮→进详情→定位）；`ops perf mobile` 关键数字不回归。
6. 相关 cargo test、前端检查、`ops quality check` 通过。

## 非目标

- 不改文章可见性与发布状态语义；搜索仅覆盖公开快照。
- 不做搜索历史、联想词、个性化排序等产品增强（后续另议）。
- 不动 `PLAN-NAV-ACTIONS-001` 的导航栏本体——本计划只交付搜索面，导航入口由该计划接线。
- 不引入外部搜索引擎服务（Elasticsearch 等）；单机自持是边界，若闸门想突破需重新评估 `FACT-RUNTIME-001`。

## 约束与依据

- `SPEC-ARTICLE-HTML-VALIDATION-001`：文内高亮方案不得绕过正文校验器；白名单变更是公共契约变更，须闸门明确决策并同步 Spec 与 WASM 校验器。
- `content_sync` 单事务快照替换：索引更新与快照同事务，验收含"合入后立即可搜到"的一致性检查。
- 写集协调：`PLAN-FRONTEND-FSD-RESTRUCTURE-001`（active，逐片改写 registry 与页面路径，与新增搜索面直接相邻，需串行并互核最新状态）；`PLAN-MOBILE-COMPONENT-EXPERIENCE-001` 若同期改 mobile 样式需互核；`PLAN-NAV-ACTIONS-001` 已 completed 归档，导航入口以已落地结构为准。
- 导航计划此前"搜索仅入口链接"的基线判断已被推翻，以本计划为准。

## 集成验收

1. 搜索旅程端到端：导航入口 → 搜索页 → 关键词 → 高亮结果 → 详情文内定位（若纳入）。
2. 内容合入一致性：新文章经 `content_sync` 合入后立即可搜；快照回滚后不可搜。
3. spike 数据与线上（integration 栈）实测数字对照留档。
4. 滥用防护演练：超限请求被拒且不影响既有端点。

## 未决项

- 分词方案（spike 后定）。
- 高亮协议与 `<mark>` 白名单决策。
- 搜索面形态与分类组合语义。
- 性能预算数值。
- Desktop 是否同轮。
