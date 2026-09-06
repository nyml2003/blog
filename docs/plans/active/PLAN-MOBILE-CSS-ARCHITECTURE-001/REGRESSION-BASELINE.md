---
kind: plan-regression-baseline
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: approved
owner: mobile-quality-and-design
write_set: [REGRESSION-BASELINE.md]
last_reviewed: 2026-09-05
---

# C Mobile CSS 回归基线

## 目的与边界

本文件定义 `PLAN-MOBILE-CSS-ARCHITECTURE-001` 在拆分 CSS、建立第一期原子组件且尚未接入业务页面期间，后续接入时必须保持的可观察行为。它是迁移前后的同数据、同路由、同视口对照清单，不是视觉重设计，也不替代 `PLAN-MOBILE-DENSITY-002` 的详情页密度验收。

范围只有 C Mobile。Desktop 的 JSX、DOM、CSS 和组件内部状态不得被本计划或本基线复用；该隔离是当前 UI/UX 架构的正式边界（`docs/architecture/ui-ux.md:24-28`）。第一期原子未接入前，不把原子组件自身的渲染当作既有页面回归证据；本基线保护的是现有页面行为，并为原子接入后的对照提供固定标准。

## 已核实的入口与前置条件

| 页面 | 开发路由 | Vite 入口 | 主要基线 |
| --- | --- | --- | --- |
| 推荐页 | `/m/` | `web/mobile/pages/home/index.html` -> `web/mobile/src/pages/home.tsx` | 推荐列表、加载/空/错状态、文章行、底部导航。 |
| 文章库 | `/m/articles/index.html` | `web/mobile/pages/articles/index.html` -> `web/mobile/src/pages/articles.tsx` | Filter Panel、Shelf、scrollspy、状态和底部导航。 |
| 文章详情 | `/m/articles/detail.html?id=<published-id>` | `web/mobile/pages/article-detail/index.html` -> `web/mobile/src/pages/detail.tsx` | 阅读栏、返回路径、详情元数据、正文主题和状态。 |

开发时先运行 `ops runtime dev` 获取项目规定的双进程命令；该命令只打印启动说明。实际联调使用两个终端：`pnpm --filter blog-web run dev` 和 `go run ./cmd/blog-server`（`ops/src/application/commands.ts:13`、`docs/guides/operations.md:17-29`）。Vite 把 `/api` 代理到 `BLOG_API_ORIGIN` 或默认的 `http://127.0.0.1:8080`（`web/vite.config.ts:5-6,69-71`），因此截图前必须有可重复的本地后端数据。

每一组前后对比使用相同的已发布数据与 URL。建议准备下列非生产样本，不写入正式 `blog.db`：

- 推荐列表至少四篇，覆盖长标题、无摘要、两个标签和超过两个标签；
- Shelf 至少三个 section，每个至少三篇，具有类型、标签、日期与一个空摘要案例；
- 可筛选的类型、多个主题标签和四个日期输入值；
- 一篇详情文章同时含标题、段落、列表、代码块、宽表格、图片、引用和链接；另备一篇无摘要、超长标题的文章；
- 可稳定触发的加载、空结果、接口错误/不可见文章状态。错误模拟应在本地开发代理或临时数据库副本完成，不能改变正式数据。

## 固定视口与记录格式

所有必测场景都在以下 CSS 像素视口记录。每张基线截图同时记录路由、完整 query、数据样本标识、浏览器、缩放比例、`devicePixelRatio` 和 `prefers-reduced-motion`；前后对比必须保持这些值一致。

| 视口 | 目的 | 必须观察 |
| --- | --- | --- |
| `320x568` portrait | 当前 `body` 最小宽度边界 | 无页面横向滚动、文字不相互覆盖、最窄表单布局。 |
| `360x800` portrait | `date-grid` 断点临界值 | `360px` 及以下日期字段单列，控件仍完整可操作。 |
| `375x812` portrait | 既有 Mobile Spec 标准视口 | 首页、Shelf、Filter、详情的主截图和交互记录。 |
| `390x844` portrait | 常见较宽手机 | 底栏安全区、长文与表单的可用宽度。 |
| `812x375` landscape | 已接受的横屏范围 | 底栏、详情正文、代码/表格内部滚动和无页面横向溢出。 |

每个场景保存迁移前和迁移后的成对证据，命名为 `<route>-<state>-<viewport>-before.png` 与同名 `-after.png`。本轮不创建截图目录或添加浏览器测试工具；证据目录和采集方式由后续测试工作流在独立写集中确定。

## 分阶段执行矩阵

“原子未接入”不是回归豁免，而是把本阶段能够证明的事实与必须等待迁移的事实分开。任何标记为“待迁移”的场景，在迁移前不得填写通过；应记录为 `blocked-by-stage`，并保留阻塞原因。

| 阶段 | 本阶段必须执行 | 本阶段不执行 | 通过含义 |
| --- | --- | --- | --- |
| A. 原子库独立实现、尚未接入业务 | 复核本文件入口/fixture/视口定义；对现有页面执行一次基线截图和关键 DOM/a11y 手工检查；运行 workspace doctor、可运行的质量门禁；确认原子源码不导入 Client、路由、全局状态或现有业务组件。 | 不把原子 Story/demo 的通过当成首页、Shelf、Filter 或详情回归；不修改业务页面来“试接入”；不对未启动的真实后端声称状态场景通过。 | 基线可重放、证据元数据完整、原子依赖边界通过；页面行为仍按现状记录，不因未接入而宣称迁移完成。 |
| B. CSS 模块迁移、原子仍未接入 | 对所有 NAV/HOME/SHELF/FILTER/DETAIL/MOTION 场景执行同数据、同 URL、同视口的 `before/after` 对照；复跑构建、类型、lint、format 和核心测试；执行人工键盘、焦点、滚动、触控和正文溢出检查。 | 不新增分子/业务组件消费；不把迁移顺便扩展为 002 密度改版；不因 Desktop 或测试基础设施阻塞而修改其写集。 | 现有页面可观察行为和 CSS 几何保持不变，且模块边界可定位；原子接入 gate 仍为待执行。 |
| C. 原子接入业务页面 | 重新执行所有高风险场景，额外逐节点核对 `ATOM-CONTRACT.md` 的原生语义、Props、状态和样式所有权；增加 disabled/loading/error/focus 的几何不变性检查。 | 不让原子组件自行读数据、请求、管理取消/重试或改写页面状态；不接受仅凭组件单测通过的页面验收。 | 页面回归与原子契约同时通过，才可开放后续分子/业务组件接入。 |

阶段 A 的“现有页面基线”只需要建立一次并冻结。当前没有浏览器自动化或固定本地 fixture，因此页面场景尚未被标记为 `pass`；这是尚未开始 CSS 迁移的执行前置条件，不是原子库或文档交付的失败。阶段 B/C 才是迁移工作流的完成门；任何一个高风险场景未执行、无证据或结果不确定，均不得标记完成。

## 统一失败判定与证据格式

### 失败等级

- `P0-blocking`：页面无法加载或无法完成主路径；任一 Mobile 入口空白/脚本异常、文章链接错误、Filter 无法关闭、详情无法返回、页面出现横向滚动、焦点落入不可见或背景仍可滚动。
- `P1-regression`：既有契约改变但主路径仍可继续；包括 active 改变几何、标题/摘要/正文被截断或覆盖、触控目标小于 `44px`、错误/空/加载缺少恢复语义、底栏遮挡内容、Shelf scrollspy 或 history 改变。
- `P2-observation`：不影响主路径的非阻断差异；例如颜色抗锯齿、字体渲染差异或浏览器自身日期控件外观。P2 仍须记录，不得用来掩盖 P0/P1。

失败条件按“任一项即失败”处理：

1. 任何 P0 或 P1；
2. `document.documentElement.scrollWidth !== document.documentElement.clientWidth`，除非溢出只发生在正文代码块/宽表格自身并且页面 viewport 未溢出；
3. 任一交互控件实际可点击盒小于 `44px`，或相邻主要目标间距小于 `8px`；
4. 迁移前后 URL/query、`aria-current`/dialog 语义、Tab 顺序、焦点恢复、`body` 滚动锁定或返回路径发生未经批准的变化；
5. 同一 fixture 下截图/DOM 结果无法复现，或缺少路由、视口、浏览器、DPR、缩放、motion 设置等证据元数据。

每个场景至少提交一条结构化记录，建议使用以下 Markdown 表格；截图不是唯一证据：

| 字段 | 要求 |
| --- | --- |
| `scenario_id` | 本文件中的 ID，例如 `FILTER-02`。 |
| `phase` / `result` | `A/B/C` 与 `pass`、`fail`、`blocked-by-stage`、`blocked-by-environment` 之一。 |
| `route` / `query` | 完整 Mobile URL，不省略筛选参数或文章 id。 |
| `fixture` | 数据集/临时数据库副本和状态注入方式；禁止写正式 `blog.db`。 |
| `viewport` / `browser` | CSS 宽高、浏览器版本、缩放、DPR、横竖屏。 |
| `motion` | `no-preference` 或 `reduce`。 |
| `actions` | 实际操作顺序，包含鼠标/触摸、Tab/Shift+Tab、Enter/Space、Escape、系统返回。 |
| `observations` | 结果、尺寸/滚动读数、焦点元素、截图文件名和控制台错误。 |
| `severity` / `owner` | 失败等级与负责修复的 workstream；环境阻塞不得归给 CSS。 |

截图只在上述字段齐全且前后使用同一条件时具备证明力。动态日期、字体加载、网络响应顺序和未固定的动画造成的差异，应先稳定 fixture/等待条件后再比较；不能直接降低失败等级。

## 回归场景

### 1. 全局壳、导航与键盘起点

| ID | 准备与操作 | 必须保持的结果 | 当前证据 |
| --- | --- | --- | --- |
| NAV-01 | 打开 `/m/`、`/m/articles/index.html`；点击底栏两个入口。 | 只有推荐/文章库两项；当前页带 `aria-current="page"` 与 active 视觉；详情页没有底栏。主内容为 `#main`。 | `web/mobile/src/components/ui.tsx:23-62`; `web/mobile/src/pages/detail.tsx:48-109`; `docs/architecture/ui-ux.md:42-47`。 |
| NAV-02 | 每条推荐/文章库路由从页面顶部按 Tab。 | 首个可见焦点可进入“跳到主要内容”，激活后焦点移动到 `#main`；所有键盘可达控件保留可见 focus outline。 | `web/mobile/src/components/ui.tsx:26-34`; `web/mobile/styles.css:21-29,695-700`。 |
| NAV-03 | 在 `375x812` 与 `812x375` 点击底栏并滚到底部。 | 底栏固定，内容以安全区底部空间避让；两个入口均至少 `48px` 高，不遮挡最后内容。 | `web/mobile/styles.css:67-69,495-518`; `docs/architecture/ui-ux.md:44,52`。 |
| MOTION-01 | 在上述页面启用 `prefers-reduced-motion: reduce`，触发 Shelf Tab 和 loading。 | 非必要 transition/animation 不播放；不以动效作为唯一状态表达。 | `web/mobile/styles.css:164-169,707-714`。 |

### 2. 推荐页与文章行

| ID | 准备与操作 | 必须保持的结果 | 当前证据 |
| --- | --- | --- | --- |
| HOME-01 | `/m/` 返回至少四条推荐数据，逐项检查短标题、长标题、无摘要及标签溢出。 | 每行整体为一个详情链接；标题可换行且无横向溢出；摘要最多两行，无摘要显示“暂无摘要”；最多两项标签与 `+N`，日期在右侧。 | `web/mobile/src/components/ui.tsx:72-95`; `web/mobile/styles.css:276-355`; `docs/specs/SPEC-MOBILE-DENSITY-001.md:38-46`。 |
| HOME-02 | 分别使推荐请求处于加载、空、失败；错误态点击重试。 | `StateMessage` 保持 `min-height: 190px`；加载为 `status`，失败为 `alert`；失败有不少于 `44px` 的恢复按钮。 | `web/mobile/src/pages/home.tsx:32-57`; `web/mobile/src/components/ui.tsx:165-183`; `web/mobile/styles.css:397-428`。 |
| HOME-03 | 点击“浏览全部文章”和任意文章行；使用浏览器返回。 | 链接目的地不变，能进入文章库/详情并可预期返回；点击和 active 反馈不改变文章行几何。 | `web/mobile/src/pages/home.tsx:58-60`; `web/mobile/styles.css:276-288,357-374`。 |

### 3. 文章库、Shelf 与状态

| ID | 准备与操作 | 必须保持的结果 | 当前证据 |
| --- | --- | --- | --- |
| SHELF-01 | `/m/articles/index.html` 返回多个非空 section，在 `375x812` 自顶部到底部滚动。 | 左轨为 sticky 分区导航，右轨连续 section；当前 section 同步 active Tab，active 只变颜色/预留指示线，不改变 Tab 的宽高或 Shelf 几何。 | `web/mobile/src/pages/articles.tsx:101-128,179-190`; `web/mobile/src/components/ui.tsx:97-162`; `web/mobile/styles.css:101-179`; `docs/architecture/ui-ux.md:75-80`。 |
| SHELF-02 | 点击任意左轨 Tab；再次用键盘聚焦并激活 Tab。 | 平滑定位到对应 section，heading 不被 header 覆盖；定位和 scrollspy 不改 URL/history；程序化滚动期间 active 不来回跳变。Tab 触控盒至少 `44px`。 | `web/mobile/src/pages/articles.tsx:92-100,129-141`; `web/mobile/src/components/ui.tsx:103-120`; `web/mobile/styles.css:121-163,175-178`。 |
| SHELF-03 | 使用长 section 名、长卡片标题、空摘要、超过两项标签与窄屏。 | 左轨和内容轨不产生横向滚动；卡片保持标题/摘要/元数据的稳定扫描结构，空摘要的低强调样式不令相邻卡片跳动。 | `web/mobile/styles.css:170-275`; `docs/architecture/ui-ux.md:60-73`。 |
| SHELF-04 | 分别触发 loading、空结果、错误，错误态点击重试。 | 标题和筛选入口不丢失；状态块有稳定最小高度、可读反馈与恢复入口。CSS 架构迁移不得把这些状态误改为原子内部的数据读取。 | `web/mobile/src/pages/articles.tsx:161-193`; `web/mobile/src/components/ui.tsx:165-183`; `docs/plans/active/PLAN-MOBILE-CSS-ARCHITECTURE-001/PM-STATUS.md:62-75`。 |

### 4. Filter Panel 与表单

| ID | 准备与操作 | 必须保持的结果 | 当前证据 |
| --- | --- | --- | --- |
| FILTER-01 | 点击“筛选文章”。 | 触发器 `aria-expanded` 变为 true；底部面板以 `role="dialog"`、`aria-modal="true"` 和可见标题出现，关闭按钮自动获得焦点，背景页面不可滚动。 | `web/mobile/src/pages/articles.tsx:152-159,195-203`; `web/mobile/src/components/ui.tsx:211-265`; `web/mobile/styles.css:603-641`。 |
| FILTER-02 | 在面板内正向/反向 Tab，按 Escape，点击关闭按钮和 backdrop。 | Tab 与 Shift+Tab 被限制在面板可聚焦元素内；三种关闭途径均关闭面板、恢复进入前焦点并恢复原 `body.style.overflow`。 | `web/mobile/src/components/ui.tsx:201-240,242-247`。 |
| FILTER-03 | 选择类型、勾选/取消多个标签、输入四个日期；点击“清除条件”。 | 使用原生 `select`、`checkbox`、`date` 输入；label/legend 可读；清除只重置本地筛选值，不异常关闭面板；日期格在 `360px` 及以下单列。 | `web/mobile/src/components/ui.tsx:267-333`; `web/mobile/filter.css:1-14`; `web/mobile/styles.css:642-675`。 |
| FILTER-04 | 在有条件时点击“查看结果”；随后使用浏览器后退/前进。 | 调用方更新 query、关闭面板、展示条件数；`popstate` 根据 URL 恢复筛选。应用与清除按钮均至少 `50px` 高，且长文本不遮挡。 | `web/mobile/src/pages/articles.tsx:31-42,82-90,129-141`; `web/mobile/src/components/ui.tsx:334-353`; `web/mobile/styles.css:676-694`。 |

### 5. 详情页与受控 HTML 正文

| ID | 准备与操作 | 必须保持的结果 | 当前证据 |
| --- | --- | --- | --- |
| DETAIL-01 | 从文章库进入详情，分别点击顶部与底部返回；另直接打开详情 URL。 | 详情仅有阅读栏返回入口，不显示底栏；同源文章库来源使用历史返回，无法确认来源时进入 `/m/articles/index.html`，不回退到站外。 | `web/mobile/src/pages/detail.tsx:21-38,48-55,99-103`; `docs/specs/SPEC-MOBILE-DENSITY-002.md:42-46`。 |
| DETAIL-02 | 使用超长标题、无摘要、2+ 标签的详情。 | 标题完整可读且不覆盖正文；无摘要不渲染占位；元数据至多两项标签加 `+N` 和更新时间。 | `web/mobile/src/pages/detail.tsx:71-98`; `web/mobile/styles.css:461-493`; `docs/specs/SPEC-MOBILE-DENSITY-002.md:24-34`。 |
| DETAIL-03 | 用含标题、段落、列表、代码、宽表格、图片、引用、链接的正文，在 portrait 与 landscape 阅读。 | 正文至少 `16px/1.7`；代码和表格仅自身可横向滚动，图片不超宽，`document.documentElement.scrollWidth === clientWidth`；链接和内联代码仍可辨识。 | `web/mobile/src/components/ui.tsx:185-186`; `web/mobile/styles.css:524-589`; `docs/specs/SPEC-MOBILE-DENSITY-002.md:36-40,54-59`。 |
| DETAIL-04 | 缺少 `id`、文章不存在/不可见、加载中或错误时检查并点击重试。 | 阅读栏保留；状态文本可见，错误有 `alert` 语义和可操作重试，布局不发生无关跳动。 | `web/mobile/src/pages/detail.tsx:41-69`; `web/mobile/src/components/ui.tsx:165-183`。 |

## 原子接入后的额外对照

原子层尚未消费现有页面时，以下规则是接入 gate，而不是现在要求页面已经具备的新增 API：

- 将原生 `<a>` 保持为链接，将 `<button>` 保持为动作；不因外观统一把二者互换；
- 每个改由 `Button`、`IconButton`、`Link`、`Input`、`Select` 或 `Checkbox` 渲染的节点，必须保留现有 `type`、`href`、`checked/value`、`disabled`、关联 label 和事件语义；
- loading、disabled、error、focus 和 active 只能改变视觉反馈，不能改变已有控件或卡片的几何尺寸；交互目标最小 `44px`，焦点可见且状态不只靠颜色；
- 原子不导入数据 Client、Solid resource adapter、路由或全局状态；加载、空、错、重试和 Filter/Shelf 的复杂交互仍由页面或业务组件处理（`PM-STATUS.md:62-75`）。

这些项目应对照 `ATOM-CONTRACT.md` 的最终 API 逐项复查。若某个原子需要新增仅为迁移方便的 Props，而当前页面场景并未证明必要性，则停止接入并由 PM 审定，不在页面内临时扩张组件库。

## 自动化与人工验收边界

当前 `web/package.json` 只有 `test:core`、typecheck、lint、format 和 build 脚本，没有 Playwright、Vitest DOM、Testing Library、Cypress、axe 或截图回归工具（`web/package.json:5-25`）。项目测试指南也规定 UI 早期采用稳定、可重复的人工验收，浏览器自动化在推荐、预览、发布和公开可见性稳定后补充（`docs/guides/testing.md:11-19`）。因此：

| 验证层 | 当前可用方式 | 可证明的范围 | 不可替代的人工检查 |
| --- | --- | --- | --- |
| 代码与依赖 | `ops workspace doctor`、`pnpm --filter blog-web typecheck`、lint、format、build、`ops quality check` | 工具可解析、类型/静态规则和打包入口。 | 视觉、触控尺寸、焦点、滚动、safe area、动画、正文溢出。 |
| Core 数据/资源 | `pnpm --filter blog-web test:core` | `web/common` 与 Solid data task 的既有单测。 | 不渲染 Mobile 页面，不能证明原子或 CSS 行为。 |
| UI 行为 | 本文件的固定路由、数据、视口、键盘和截图步骤。 | 真实浏览器中可观察的页面结果。 | 当前没有可自动化执行的浏览器断言或像素差分。 |

本计划不新增测试依赖。后续若引入浏览器自动化，应单独立项并先固定本文件的 fixture、viewport、reduced-motion、等待条件和截图命名；不要把网络不稳定、动态日期或未固定的字体当成视觉差异。

## CSS 迁移开工 Gate

在 `WORKSTREAM-MOBILE-CSS-MIGRATION` 从 `ready` 变更为实施中之前，PM 与质量 owner 必须逐项确认：

- [ ] 阶段 A 已记录当前路由、样本数据、视口和关键场景；没有真实后端/fixture 的行明确标为 `blocked-by-environment`，而不是空白或 `pass`。
- [ ] 迁移前/后截图与场景记录的存放位置已指定给测试工作流，且不与 CSS/原子实现写集重叠。
- [ ] 至少一组受控本地数据能重现推荐、Shelf、Filter、详情和所有加载/空/错状态；该数据不写入正式 `blog.db`。
- [ ] 阶段 B 的执行人已经确认五个固定视口、浏览器版本、DPR、缩放和 `prefers-reduced-motion` 值。
- [ ] `ATOM-CONTRACT.md` 已审定；若 CSS 迁移仍不接入原子，只检查其“无数据/异步/路由依赖”边界，不提前改动消费方。
- [ ] 在迁移开始时重新运行全仓 build、core test、typecheck、lint、format；任何当时失败均以准确命令、错误文本和所属 owner 记录，迁移任务不会修改非 CSS 写集来消除噪声。
- [ ] 实施者确认本文件所有 P0/P1 判定、证据字段和退出条件；没有“靠肉眼大致相似”作为验收标准。

任意未勾选项使迁移保持 `ready`。这不是新增产品约束，而是为了确保 CSS 文件拆分可以被真实页面结果而非静态代码印象验证。

## 建议的验收命令与顺序

```text
# 只读环境诊断
ops workspace doctor

# 现有质量门禁；重新执行时记录完整结果与任何非 CSS 问题
ops quality check

# 开发联调说明（不会启动服务）
ops runtime dev

# 两个终端运行后，按本文件的固定路由与视口手工执行场景
pnpm --filter blog-web run dev
go run ./cmd/blog-server
```

对每次 CSS/原子接入变更，先完成前后截图与关键键盘交互，再复跑质量门禁。只有在同一数据集下所有必测行通过，并确认没有页面横向滚动、焦点/滚动锁定回归或 state 几何变化时，才允许把迁移工作流标记为完成。

## 当前交接状态与已执行证据

本次基线审计执行了 `ops workspace doctor`，Go、Node、pnpm、Rust、Cargo 和 SQLite3 均可用。交接前在当前工作树重新运行了 `ops quality check`、`pnpm --dir web format:check`、`pnpm --dir web typecheck`、`pnpm --dir web lint`、`pnpm --dir web build`、`pnpm --dir web test:core` 和原子 fail-fast 单测；全部通过。该结果只证明静态质量、构建和既有 core 测试，不证明未迁移页面的视觉或交互回归。

当前不存在阻止文档交接的代码质量失败。后续迁移的执行前置条件仍未满足：没有冻结的本地 fixture、截图/场景记录目录、浏览器/DPR 采集约定和实际的页面基线证据。因此 `WORKSTREAM-MOBILE-CSS-MIGRATION` 与 `WORKSTREAM-MOBILE-CSS-TESTING` 保持 `ready`，不能据此文档把 CSS 拆分、页面回归或原子接入标记为完成。

交接后的每次迁移必须重新运行上述质量门禁；若产生与 CSS 无关的失败，按本文件的 `blocked-by-environment` 字段记录准确命令、错误文本和 owner，不得在本计划写集中扩大修复范围。

## 退出条件

- 全部 NAV、HOME、SHELF、FILTER、DETAIL、MOTION 场景具有迁移前后同条件证据；
- 375x812 与 812x375 至少覆盖所有高风险交互，320x568、360x800、390x844 覆盖溢出与断点；
- Filter 的焦点圈定、Escape/backdrop 关闭、焦点恢复和背景滚动锁定均通过；
- Shelf 的 sticky、scrollspy、程序化定位和 URL/history 不变性均通过；
- 详情返回、错误恢复、正文内部横向滚动和页面无横向溢出均通过；
- 原子接入不改变上述原生语义、可访问性、触控尺寸或页面数据/异步职责；
- 所有可运行的质量门禁通过，或有经 PM 单独记录、与本计划无关的外部阻塞及后续复测证据。
