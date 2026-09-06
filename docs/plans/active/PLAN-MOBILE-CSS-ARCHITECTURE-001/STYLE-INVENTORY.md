---
kind: audit-inventory
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: complete
owner: mobile-css-architecture
depends_on: [PM-STATUS.md]
write_set: [docs/plans/active/PLAN-MOBILE-CSS-ARCHITECTURE-001/STYLE-INVENTORY.md]
last_reviewed: 2026-09-05
---

# C Mobile 样式与 class Inventory

## 审计边界与证据

本清单只审计当前 C Mobile 已导入的样式和 DOM，不改变任何源码。证据范围为：

- `web/mobile/styles.css`（721 行）；
- `web/mobile/filter.css`（14 行）；
- `web/mobile/src/components/ui.tsx`（现有业务组件）；
- `web/mobile/src/pages/home.tsx`、`articles.tsx`、`detail.tsx`（现有页面）。

所有三页导入 `styles.css`；仅文章库页另外导入 `filter.css`。当前没有独立的原子组件文件或原子 CSS 模块。下表中的“目标层级”和“目标模块”是迁移后的唯一所有权，不代表本阶段把既有 DOM 接入原子。

层级的含义如下：

| 层级 | 可承担的职责 | 本期处置 |
| --- | --- | --- |
| 原子 | 原生语义、受控视觉状态、键盘焦点和触控尺寸；无领域数据、请求、路由或复杂状态 | 仅批准 `Text`、`Heading`、`Button`、`IconButton`、`Link`、`Label`、`Input`、`Select`、`Checkbox` 的独立实现；不接入当前消费方。 |
| 分子 | 已证实重复的原子组合，例如 field 或按钮组 | 不实现；`check` 和 `panel-actions` 保持 Filter 局部结构，待重复证据出现。 |
| 业务组件 | 领域数据的展示、局部交互、状态映射 | `ArticleRow`、Shelf、导航、`StateMessage`、`FilterPanel` 均保留。 |
| 页面 | 路由场景、页面节奏和业务组件编排 | 首页、文章库、阅读页保留。 |
| 内容主题 | 系统包裹的受控 HTML 片段 | 仅 `.article-body` 及其语义后代；不进入组件库。 |

## 现状总览

| 项目 | 现状 | 迁移结论 |
| --- | --- | --- |
| 样式入口 | `styles.css` 同时包含 token、reset、Shell、Shelf、ArticleRow、详情、文章正文、Filter 和交互状态；`filter.css` 仅有日期网格。 | 按责任拆为 `tokens`、`base`、`shell`、`layout`、`atoms`、`components`、`shelf`、`filter`、`detail`、`article-body`、`pages`，由页面入口一次导入。 |
| 组件边界 | `ui.tsx` 同时承载导航、文章条目、Shelf、状态、正文和 Filter；只有 `pageStyles()` 空函数作为历史入口。 | 业务组件暂不改动；新原子独立目录与 CSS 所有权，不从 `ui.tsx` 反向暴露。 |
| 状态表达 | `active`、`empty`、`loading`、`error` 是无命名空间的并列 class。 | 迁移时保留行为，根组件使用 `.is-*` modifier；严禁页面祖先选择器隐式改变原子。 |
| 原始视觉值 | token 已有 9 个颜色变量，但透明表面、白色、空摘要色、代码色、引用色、焦点色仍直接写入模块。 | 将跨模块值纳入语义 token；文章语法色仅可留在内容主题 token。 |
| 表单样式 | Filter 通过 `.filter-panel select`、`.filter-panel input[type="date"]` 和 `.check input` 直接定位原生元素。 | 未来由 `Select`、`Input`、`Checkbox`、`Label` 原子拥有控件外观；Filter 仅拥有面板与字段编排。 |

## Selector 到目标模块映射

### Token 与基础规则

| 当前 selector（证据） | 当前责任/消费者 | 目标层级与模块 | 风险与迁移前置条件 |
| --- | --- | --- | --- |
| `:root`（`styles.css:1`） | `--paper` 至 `--danger` 的全局颜色变量，所有页面。 | 基础；`styles/tokens.css`。 | 扩展为语义表面、前景、交互、焦点、代码主题和层级 token；逐模块替换原始值后才删除遗留值。 |
| `*`（`styles.css:12`） | 全局 `box-sizing`。 | 基础；`styles/base.css`。 | 无业务依赖，必须在入口最早加载。 |
| `html`（`styles.css:15`） | 页面纸色、默认文字与字体。 | 基础；`styles/base.css`。 | 保持对全部路由生效，不能被文章正文重置。 |
| `body`（`styles.css:20`） | 去默认 margin、320px 最小宽度；Filter 运行时写入 `overflow`。 | 基础；`styles/base.css`。 | Filter 的滚动锁定仍由业务组件管理，基础规则不可吸收该状态。 |
| `a`（`styles.css:24`） | 重置默认链接颜色/下划线；影响导航、文章卡、正文链接。 | 基础；`styles/base.css`。 | 保留只作为 reset；正文链接由 `article-body.css` 恢复内容语义；`Link` 原子不得依赖页面祖先。 |
| `button, input, select`（`styles.css:28`） | 继承字体与颜色。 | 基础；`styles/base.css`。 | 保留原生归一化；尺寸、边框、禁用和焦点由原子拥有。 |
| `a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible`（`styles.css:695`） | 全站可见焦点。 | 基础；`styles/base.css`，并由原子补充各自状态。 | 不能在原子落地前删除；`fieldset` 内控件、导航链接和阅读链接均依赖。焦点颜色 `#8fa5f3` 应 token 化。 |
| `@media (prefers-reduced-motion: reduce) *`（`styles.css:707`） | 全局减弱动画/滚动。 | 基础；`styles/base.css`。 | 需先确认平滑滚动与加载动画仍尊重该规则。 |

### Shell、通用排版与页面局部结构

| 当前 selector（证据） | 当前责任/消费者 | 目标层级与模块 | 风险与迁移前置条件 |
| --- | --- | --- | --- |
| `.skip-link`, `.skip-link:focus`（`styles.css:34,42`） | `MobileNav` 的跳至主内容链接（`ui.tsx:26`）。 | Shell；`styles/shell.css`。 | 是 Shell 可访问性边界，不应作为通用 `Link` 视觉 variant；焦点可见性必须保留。 |
| `.mobile-header`（`styles.css:46`） | `MobileNav` 顶部 sticky header（`ui.tsx:29`）。 | Shell；`styles/shell.css`。 | 与 Shelf 的 sticky top 值及滚动偏移有关，先集中 header 高度 token。 |
| `.mobile-brand`, `.mobile-brand span`, `.mobile-brand strong`（`styles.css:58,63,69`） | 顶部品牌链接及内部文字（`ui.tsx:30-33`）。 | Shell；`styles/shell.css`。 | 后两个是组件内部受控后代，可保留；不可把品牌文案的层级抽为 `Text` 的全局后代选择器。 |
| `.mobile-shell`（各 page `:23/:48/:144`；当前无 CSS selector） | 三页的根结构 class。 | Shell；`styles/shell.css`，仅在确有根容器职责时保留。 | 当前是未样式的稳定 hook，迁移时先确认是否承担将来的 shell scope；不能仅为“每个元素有 class”而补样式。 |
| `.mobile-main`（`styles.css:72`） | 三页的主内容容器（各 page `main`）。 | Shell；`styles/shell.css`。 | 底部导航安全区的预留必须与 `.bottom-nav` 同步验证。 |
| `.page-heading`（`styles.css:77`） | 首页和文章库页标题区。 | 页面；`styles/pages.css`。 | 是页面节奏，不能并入 `Heading`。 |
| `.eyebrow`（`styles.css:80`） | 首页、文章库、详情页的辅助标题（各 page）。 | 原子候选 `Text`；`styles/atoms.css`。 | 当前 class 含外边距，迁移时把与页面标题的间距移给页面/布局，原子只定义文本 role。 |
| `.page-heading h1, .detail-header h1`（`styles.css:87`） | 首页/文章库标题和详情标题。 | 原子候选 `Heading`；`styles/atoms.css`。 | **跨页面祖先耦合**：详情又以 `.detail-header h1`（466）覆盖字号。需以 Heading size variant 替代，不能保留父级覆盖。 |
| `.subtle, .meta`（`styles.css:95`） | `subtle` 用于首页/文章库摘要；`meta` 当前无 Mobile JSX 消费者。 | 原子候选 `Text`；`styles/atoms.css`。 | `meta` 是孤儿 selector，先确认无静态 HTML 消费者再删除或替换；Text tone 不能拥有周边布局 margin。 |
| `.article-list`（`styles.css:101`） | 首页推荐列表容器（`home.tsx:50`）。 | 页面；`styles/pages.css`。 | 仅首页组织，不是 `ArticleRow` 内部样式。 |
| `.primary-action`（`styles.css:357,372`） | 首页“浏览全部文章”的 `<a>`（`home.tsx:58`）。 | 原子候选 `Link`；`styles/atoms.css`。 | 与 `.apply-button` 共用同一 selector 造成 `<a>` 和 `<button>` 视觉耦合；以后分别以 Link action variant 与 Button primary variant 表达，不把导航 URL 塞进 Button。 |
| `.filter-trigger`, `.filter-trigger span:last-child`（`styles.css:375,383,390`） | 文章库页打开 Filter 的按钮和已选条件摘要（`articles.tsx:152`）。 | 业务；`styles/filter.css`。 | 外层可消费未来 `Button`，但双文本排布和计数是 Filter 领域结构；`span:last-child` 是不稳定位置选择器，迁移时改为受控内部 class。 |
| `.back-button`（`styles.css:375,394`） | 当前无 JSX 消费者。 | 待删除/确认；不进入原子范围。 | 先用静态构建产物/模板确认无外部 DOM 使用；否则此孤儿规则会伪造不存在的 API。 |
| `@media (max-width: 360px) .mobile-brand strong`（`styles.css:702`） | 窄屏品牌字级。 | Shell；`styles/shell.css`。 | 与品牌内部结构同模块，防止拆后遗漏。 |

### 文章条目与状态反馈

| 当前 selector（证据） | 当前责任/消费者 | 目标层级与模块 | 风险与迁移前置条件 |
| --- | --- | --- | --- |
| `.article-row`, `.article-row:active`（`styles.css:276,287`） | 首页 `ArticleRow` root link（`ui.tsx:76`）。 | 业务；`styles/components.css`。 | 是文章领域的链接卡，不能降为 `Link`；按压色应改为语义交互 token。 |
| `.row-anchor`（`styles.css:290`） | `ArticleRow` 的文章类型列（`ui.tsx:77`）。 | 业务；`styles/components.css`。 | 业务数据，不是 `Text` 的通用 variant。 |
| `.row-top`, `.row-top h2`（`styles.css:303,310`） | `ArticleRow` 标题布局与内部 heading（`ui.tsx:78-80`）。 | 业务；`styles/components.css`。 | 受控内部结构可使用 `Heading`，但网格位置仍归 ArticleRow；禁止页面选择器覆盖其 heading。 |
| `.row-summary`, `.row-summary.empty`（`styles.css:317,328`） | ArticleRow 摘要及缺摘要状态（`ui.tsx:81`）。 | 业务；`styles/components.css`。 | `empty` 是裸状态 class；迁移为组件 root modifier 或内部 `.is-empty`，并 token 化 `#89919a`。 |
| `.row-meta`, `.row-meta time`（`styles.css:331,340`） | ArticleRow 标签与日期行（`ui.tsx:84-92`）。 | 业务；`styles/components.css`。 | `time` 排版只属于文章条目，不能写进通用 Text。 |
| `.row-tags`, `.row-tags span`（`styles.css:344,350`） | ArticleRow 截断的标签集合。 | 业务；`styles/components.css`。 | 内容截断和最多两项由业务组件决定，原子不读取 terms。 |
| `.state-message`, `.state-message span`, `.state-message p`（`styles.css:397,407,417`） | 三页加载/空/错状态（`ui.tsx:165-182`）。 | 业务；`styles/components.css`。 | 状态由页面/Client adapter 映射；原子不得吸收 `loading`/`error` 业务状态机。 |
| `.state-message.loading span`, `@keyframes state-spin`（`styles.css:414,430`） | Loading 图形转动。 | 业务；`styles/components.css`。 | 必须继续受全局 reduced-motion 控制；不要把 Unicode 图标状态放进 `IconButton`。 |
| `.state-message.error`（`styles.css:427`） | 错误态文字色。 | 业务；`styles/components.css`。 | 裸 `error` class 迁移为 `.is-error`；颜色由 danger token。 |
| `.retry-button`（`styles.css:420`） | `StateMessage` 的重试动作（`ui.tsx:178`）。 | 原子候选 `Button`；`styles/atoms.css`。 | 重试回调、请求与错误归一化仍在上层；原子仅接受 disabled/loading/click 等受控 Props。 |

### Shelf 与文章库浏览结构

| 当前 selector（证据） | 当前责任/消费者 | 目标层级与模块 | 风险与迁移前置条件 |
| --- | --- | --- | --- |
| `.shelf-layout`（`styles.css:106`） | 文章库的分区索引和内容双列（`articles.tsx:179`）。 | 页面/业务编排；`styles/shelf.css`。 | 与窄屏、sticky 索引和文章区共同演进，不能成为通用 Layout。 |
| `.shelf-index`（`styles.css:112`） | `ShelfIndex` sticky 可滚动导航（`ui.tsx:103`）。 | 业务；`styles/shelf.css`。 | `top:84px`、`max-height` 与 mobile header/主区耦合；先建立 shell 尺寸 token 后迁移。 |
| `.shelf-index-tab`, `::before`, `.active`, `.active::before`（`styles.css:122,141,156,160`） | `ShelfIndex` 的选择按钮和当前分区指示（`ui.tsx:106-117`）。 | 业务；`styles/shelf.css`。 | `active` 是裸 modifier，改为 `.is-active`；按钮可消费原子 Button 的语义基础，但 scrollspy 与选中状态属于 Shelf。 |
| `@media (prefers-reduced-motion: reduce) .shelf-index-tab`（`styles.css:164`） | Shelf 指示动画降级。 | 业务；`styles/shelf.css`。 | 可与全局 reduced-motion 并存；不得在拆分时丢失伪元素动画关闭。 |
| `.shelf-content`（`styles.css:170`） | `articles.tsx:185` 的分区列表容器。 | 业务；`styles/shelf.css`。 | 仅文章库有此间距和最小宽度。 |
| `.shelf-section`（`styles.css:175`） | `ShelfSection` root（`ui.tsx:146-162`）。 | 业务；`styles/shelf.css`。 | `scroll-margin-top` 与上方 sticky 元素相关；`contain` 的绘制/定位影响需回归。 |
| `.shelf-section-heading`, `p`, `h2`, `span` 后代（`styles.css:180,189,197,204`） | Shelf 分区标题的固定 DOM（`ui.tsx:152-155`）。 | 业务；`styles/shelf.css`。 | 受控业务内部后代允许深度选择器；Heading/Text 原子只能替换标签外观，不能接管 grid。 |
| `.shelf-cards`（`styles.css:208`） | `ShelfSection` 中的文章卡列表（`ui.tsx:157`）。 | 业务；`styles/shelf.css`。 | 仅服务 Shelf。 |
| `.shelf-card`, `:active`, `h3` 后代（`styles.css:212,222,225`） | 私有 `ShelfCard` root、按压态和标题（`ui.tsx:123-142`）。 | 业务；`styles/shelf.css`。 | 文章领域卡片，不是基础 Link；`h3` 固定子结构可留在业务模块。 |
| `.shelf-summary`, `.shelf-summary.empty`（`styles.css:236,247`） | ShelfCard 摘要与空摘要状态（`ui.tsx:129`）。 | 业务；`styles/shelf.css`。 | 与 `.row-summary` 重复色值和 line clamp，但数据密度不同；先用 token 收敛，不在本期建立通用摘要组件。 |
| `.shelf-card-meta`, `time` 后代（`styles.css:250,258`） | ShelfCard 标签/日期行（`ui.tsx:132-140`）。 | 业务；`styles/shelf.css`。 | `time` 样式不得泄露至全局。 |
| `.shelf-card-tags`, `span` 后代（`styles.css:263,269`） | ShelfCard 标签截断。 | 业务；`styles/shelf.css`。 | 与 `.row-tags` 相似但宽度不同，仍未形成稳定分子。 |

### 详情页与受控文章 HTML 主题

| 当前 selector（证据） | 当前责任/消费者 | 目标层级与模块 | 风险与迁移前置条件 |
| --- | --- | --- | --- |
| `.reading-bar`, `.reading-bar a`（`styles.css:435,447`） | 详情页返回/阅读 bar（`detail.tsx:50-55`）。 | 页面；`styles/detail.css`。 | 返回 URL 和浏览器历史语义留在页面；`a` 可用 Link 原子，但 bar 编排不进入组件库。 |
| `.detail-main`（`styles.css:453`） | 详情页主区（`detail.tsx:56`）。 | 页面；`styles/detail.css`。 | 是 `.mobile-main` 的页面 modifier；迁移时命名应表达 modifier 而非通过祖先覆盖。 |
| `.mobile-article`（`styles.css:457`） | 详情文章容器（`detail.tsx:71`）。 | 页面；`styles/detail.css`。 | 不属于 `.article-body`，它控制阅读页外围宽度。 |
| `.detail-header`, `.detail-header h1`（`styles.css:461,466`） | 文章标题/元信息区（`detail.tsx:72-96`）。 | 页面；`styles/detail.css`，Heading 外观见原子。 | `.detail-header h1` 是与 `.page-heading h1` 的交叉选择器重复；以 Heading size prop + 详情布局 class 解耦。 |
| `.detail-summary`（`styles.css:470`） | 文章摘要（`detail.tsx:78`）。 | 页面；`styles/detail.css`。 | 可在以后消费 Text，但摘要的显隐由详情数据决定。 |
| `.detail-meta`, `> span:not(:last-child)::after`, `time`（`styles.css:476,486,491`） | 文章标签、分隔符、更新时间（`detail.tsx:80-95`）。 | 页面；`styles/detail.css`。 | **位置耦合**：`:last-child` 对 terms 数量和 `time` 排列敏感；迁移时由受控 meta item class 或 DOM 分隔元素取代。 |
| `.detail-footer`, `.detail-footer a`（`styles.css:590,597`） | 文章底部返回链接（`detail.tsx:99-103`）。 | 页面；`styles/detail.css`。 | 页面导航行为，不是通用 CTA；维持 44px 触控目标。 |
| `.article-body`（`styles.css:524`） | `ArticleBody` 注入的系统 HTML 片段（`ui.tsx:185-186`）。 | 内容主题；`styles/article-body.css`。 | 严格以此 root 限域；不让文章作者 class 或 inline style 获得主题控制权。 |
| `> :first-child`、`:where(h1,h2,h3)`、`:where(p,ul,ol)`、`:where(ul,ol)`、`li + li`（`styles.css:529,532,536,539,542`） | 文章 HTML 基础排版。 | 内容主题；`styles/article-body.css`。 | 受控 HTML 是允许的深层选择器例外；标签白名单和 sanitization 不属于本计划。 |
| `:where(pre,table)`、`pre`、`code`、`:not(pre) > code`（`styles.css:545,550,561,564`） | 代码块、表格溢出和行内代码。 | 内容主题；`styles/article-body.css`。 | 水平溢出保护是回归项；`#111923`、`#e7edf2`、`#e9e5dd`、`#8f3d30` 转为内容主题 token。 |
| `blockquote`、`a`、`img`、`:where(th,td)`（`styles.css:569,575,580,586`） | 引用、正文链接、图片和表格单元格。 | 内容主题；`styles/article-body.css`。 | 不得被全局 `a` reset 覆盖；图像和表格必须继续无横向页面溢出。 |

### Filter Panel 与原生表单

| 当前 selector（证据） | 当前责任/消费者 | 目标层级与模块 | 风险与迁移前置条件 |
| --- | --- | --- | --- |
| `.filter-backdrop`（`styles.css:603`） | `FilterPanel` 遮罩、点击外部关闭（`ui.tsx:242-248`）。 | 业务；`styles/filter.css`。 | z-index 与 bottom nav 同为 20，叠放顺序依赖 DOM；应建立 layer token 并做面板回归。 |
| `.filter-panel`（`styles.css:611`） | 对话框 root（`ui.tsx:249-354`）。 | 业务；`styles/filter.css`。 | 有焦点圈定、Escape、滚动锁定和焦点恢复，不能降为分子或原子。 |
| `.panel-head`, `h2`, `button` 后代（`styles.css:619,631,635`） | Filter 标题、sticky header、关闭按钮。 | 业务；`styles/filter.css`。 | `button` 后代是父级类型选择器；关闭动作日后以 `IconButton` 承接，header 的 sticky/布局仍归 Filter。 |
| `.filter-panel label, .filter-panel fieldset`（`styles.css:642`） | Filter 中 label/fieldset 的块级间距。 | 业务布局；`styles/filter.css`。 | `Label` 原子只能负责 label 本身；fieldset/legend 是表单编排，不能因抽原子丢失组语义。 |
| `.filter-panel select, .filter-panel input[type="date"]`（`styles.css:647`） | Filter 选择与日期输入外观。 | 原子候选 `Select`、`Input`；`styles/atoms.css`。 | **父级类型选择器**：原子落地后改为各自 root class；Filter 仅保留 field 间距。当前只证明 `select` 和 `input[type=date]`，不要预建文本、搜索等输入变体。 |
| `.filter-panel fieldset`, `.filter-panel legend`（`styles.css:658,662`） | 主题/标签组。 | 业务；`styles/filter.css`。 | `fieldset`/`legend` 是原生组语义，不属于 `Label` 原子。 |
| `.check`, `.check input`（`styles.css:666,672`） | Filter 中 label + checkbox + term 文本（`ui.tsx:283-296`）。 | Filter 局部，未来可评估分子；`styles/filter.css`。 | `!important` 是对 `.filter-panel label` 的覆盖信号；先消除冲突，再只让 `Checkbox` 原子拥有控件尺寸。 |
| `.date-grid`, `.date-grid label`（`filter.css:1,6`） | 四个日期字段的双列/窄屏单列布局（`ui.tsx:300-332`）。 | 业务；`styles/filter.css`。 | 已独立文件但与其它 Filter 样式拆开，迁移时合并到同一模块；Label 原子不能拥有 grid。 |
| `@media (max-width:360px) .date-grid`（`filter.css:10`） | 日期字段窄屏重排。 | 业务；`styles/filter.css`。 | 需保留 360px 以下的无横向溢出回归。 |
| `.panel-actions`（`styles.css:676`） | Filter sticky 操作区（`ui.tsx:334`）。 | 业务；`styles/filter.css`。 | 可编排未来 Button 原子，但 sticky/footer grid 是 Panel 责任，不建立“按钮组”分子。 |
| `.apply-button`, `.clear-button`（`styles.css:357,686,689`） | Filter 应用与清除按钮（`ui.tsx:335-352`）。 | 原子候选 `Button`；`styles/atoms.css`。 | `.apply-button` 目前与首页 Link 共用声明，必须拆成 Button `primary` 与 Link `action`；清除为 `secondary`。清除/应用逻辑、Filter state 和 async 后果不进入 Button。 |

### 底部导航与响应式限定

| 当前 selector（证据） | 当前责任/消费者 | 目标层级与模块 | 风险与迁移前置条件 |
| --- | --- | --- | --- |
| `.bottom-nav`, `a`, `a.active`, `.nav-mark`（`styles.css:495,507,516,520`） | 首页、文章库的固定主导航（`ui.tsx:38-62`）。 | Shell；`styles/shell.css`。 | `active` 是裸状态 class，改为 `.is-active` 或与 `aria-current` 对齐的语义选择器；导航链接和图标文字不降为 IconButton。 |
| `@media (min-width:700px) .bottom-nav`（`styles.css:716`） | 宽屏时底部导航与主区同宽。 | Shell；`styles/shell.css`。 | 与 `.mobile-main` 的 760px 上限成对回归，避免固定 bar 在宽屏错位。 |

## 跨职责与重复项清单

| 问题 | 证据 | 风险 | 迁移动作 |
| --- | --- | --- | --- |
| 跨页面祖先耦合 | `.page-heading h1, .detail-header h1`（87）和 `.detail-header h1`（466）。 | Heading 视觉由页面祖先决定，后续一个页面改标题可能影响另一个。 | `Heading` 原子提供已证明的 size；页面只持有周边间距。 |
| 同一视觉声明混用链接与按钮 | `.primary-action, .apply-button`（357）。 | 导航与命令共享实现，无法独立处理语义、disabled 或 loading。 | 拆为 Link action 与 Button primary；本期不改既有 DOM。 |
| Filter 通过祖先/元素类型设计控件 | `.filter-panel button/select/input/label`（635、642、647）。 | 新控件或层级调整会意外继承，原子没有 CSS 所有权。 | 原子 root class 取得控件外观，Filter 留下结构规则。 |
| 裸状态 class | `.active`（156、516）、`.empty`（247、328）、`.loading`（414）、`.error`（427）。 | 在同一 DOM 树中无法可靠归属，易与新库状态冲突。 | 迁移到对应 root 的 `.is-active/.is-empty/.is-loading/.is-error`。 |
| 位置选择器 | `.filter-trigger span:last-child`（390）、`.detail-meta > span:not(:last-child)::after`（486）。 | DOM 顺序改变即改变视觉语义。 | 使用受控内部 class 或显式分隔元素。 |
| 必须保留的受控深层选择器 | 品牌、ArticleRow、Shelf、Filter、`.article-body` 的内部后代。 | 一刀切“禁止深层选择器”会破坏固定 DOM 与 HTML 主题。 | 仅组件内部和 `.article-body` 使用；页面不得越过业务组件 root。 |
| 原始色值散落 | 透明背景（55、223、288、505、609）、空摘要色（248、329）、正文主题色（553-573）、白色（39、369、656）、焦点色（699）。 | token 化前无法保证主题或对比度一致。 | 增加对应语义 token；颜色不以 raw hex 出现在原子/业务模块。 |
| 重复排版/圆角/高度 | 3px 圆角（367、379、424、555、655、692），44/46/48/50px 触控高度，10-17px 多组小文本。 | 无法验证组件库的一致性。 | 原子建立已证明的 size/height scale；业务布局仅选择 variant。 |
| `!important` 覆盖 | `.check { display:flex !important; }`（666）覆盖 `.filter-panel label`（642）。 | 反映 Filter 内结构与表单基础样式的责任冲突。 | 先拆 Filter field layout 与 Checkbox control，再删除 `!important`。 |

## 原子实现与后续接入的门槛

1. 仅实现已批准的九个原子，且每个拥有自身 root class、受控视觉状态、原生语义、可见焦点和不小于 44px 的可交互目标；`Text`、`Heading`、`Label` 没有不必要的最小触控尺寸。
2. 原子不读取 SDK、路由、全局状态或 DOM 数据，不发请求，也不管理取消、重试、缓存、并发或领域 loading/error 状态；这些由 Client SDK、Solid adapter 与业务组件分层处理。
3. Filter Panel、Shelf、导航、文章条目、状态反馈、页面和 `.article-body` 在本计划的原子阶段全部保持现状，不接入。它们只能在原子 API、模块边界和回归基线审定后另行迁移。
4. 每一次未来接入必须同时替换其旧 selector，不能通过页面祖先覆盖原子 root；并验证 320px、360px、常见手机宽度和 700px 宽屏限制下无横向溢出。
5. 详情页与文章正文在本计划内是保护基线。其模块拆分完成并视觉回归后，才交由 `PLAN-MOBILE-DENSITY-002` 修改信息密度。

## 未决问题

- `MobileNav` 的 `active` 参数当前未使用（`ui.tsx:23`）。它不是 CSS 拆分问题，需在业务导航审计中决定删除或落实，不能借原子库改动。
- `.meta` 与 `.back-button` 没有当前 Mobile TSX 消费者。接入前需搜索静态入口/外部模板；确认无引用后应删除，而非纳入新组件 API。
- 当前 `:root` 只有颜色 token，尚无统一的尺寸、z-index、圆角、motion 或 shell 高度 token。是否引入 CSS Cascade Layer 仍维持计划的“审计后决定”，本 inventory 不预设。
