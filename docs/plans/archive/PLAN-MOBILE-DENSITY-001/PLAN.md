---
kind: plan
id: PLAN-MOBILE-DENSITY-001
status: completed
owner: project-manager
created: 2026-09-05
last_reviewed: 2026-09-05
---

# C Mobile 信息密度优化

## 目标

在不牺牲阅读舒适度、触控可用性和内容层级的前提下，提高 C Mobile 文章库的首屏与连续扫描能力。文章库采用页面级 F 型 Shelf：左侧是 sticky 分区导航，右侧按“推荐、前端、后端”等分区展示文章卡片；滚动时左侧跟随当前分区，点击分区滚动到对应分区首卡。移动端继续保持独立页面和独立组件实现，不以响应式压缩 PC 页面为实现方式。

## 成功标准

- 文章库在 `375x812` 竖屏展示左侧分区导航和右侧连续内容，推荐分区最多显示 3 张卡片，类型分区按后端返回顺序展示。
- 用户滚动右侧内容时，左侧 active 分区稳定跟随；点击任一分区时滚动到该分区标题和第一张卡片。
- 文章卡片具备可扫描的信息层级：标题、摘要、主题/标签和更新时间；过长文本有明确截断规则。
- 主要触控目标不小于 `44px`，筛选和导航不依赖 hover，返回和浮层关闭行为符合移动端约定。
- 加载、空结果、错误和筛选提交状态都有稳定占位，不因异步内容造成明显布局跳动。
- 通过移动端浏览器验收，PC 页面、B 端页面和共享领域/API 契约不发生非目标变化。

## 非目标

- 不重做 PC 端页面；B Desktop 仅增加摘要输入、回显和预览，不改变其他管理流程。
- 不在客户端做推荐、类型和文章列表的业务数据归一化；由 Mobile BFF 返回最终 Shelf sections。
- 仅新增一个可选文章摘要字段，不新增推荐算法、搜索能力或认证能力。
- 不引入自定义文章 CSS、第二套主题或新的视觉品牌系统。
- 不把移动端组件与 PC 组件合并为同一套 DOM/CSS 实现。

## 约束与依据

- 事实：`FACT-PRODUCT-001`、`FACT-RUNTIME-001`；
- 架构：`ARCH-UIUX`、`ARCH-FRONTEND`；
- 设计基线：移动端优先、触控目标至少 `44px`、内容宽度受控、异步内容预留空间、长文本截断且可进入详情页；
- 本计划只覆盖 C Mobile，B Mobile 仍延期。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 产品：信息层级与验收口径 | product | - | `docs/specs/SPEC-MOBILE-DENSITY-001.md`, `docs/specs/SPEC-ARTICLE-SUMMARY-001.md` | completed |
| 数据/API：文章摘要与 Mobile Shelf BFF | backend | 产品输出 | `migrations/`, `internal/`, `docs/architecture/data-and-api.md`, `web/common/contracts/domain.ts`, `docs/specs/SPEC-MOBILE-SHELF-BFF-001.md` | completed |
| 视觉：分区 Shelf、密度与无抖动规范 | visual-design | 产品输出 | `docs/architecture/ui-ux.md` | completed |
| 前端：B Desktop 摘要适配 | frontend-admin | 数据/API 输出 | `web/desktop/src/pages/admin/` | completed |
| 前端：C Mobile 页面实现 | frontend-mobile | 产品、视觉、数据/API 输出 | `web/mobile/` | completed |
| 项目管理：拆解、依赖、集成验收 | project-manager | 全部工作流 | 本计划目录、结果文档和归档目录 | completed |

项目经理工作流定义见 `WORKSTREAM-PM.md`。一个 PM agent 可以持有整个计划的协调上下文，但不自动获得替代其他专业工作流的权限。

工作流可以在不重叠写集时并行；产品验收口径完成后，视觉和数据/API 才能锁定细节，B Desktop 和 C Mobile 等待数据契约。PM 独占计划目录，专业工作流通过交付记录回报，不直接改写计划状态。

## 集成验收

1. 产品工作流产出移动端页面清单、信息优先级和稳定的 `SPEC-*` 场景。
2. 视觉工作流产出移动端密度令牌、条目结构、筛选入口、空/错/加载状态和浮层边界。
3. 数据/API 完成 Mobile BFF 读取模型和摘要闭环，C Mobile 只消费已归一化的 sections。
4. C Mobile 实现页面级 F 型 Shelf、Scrollspy、点击定位和无 URL 变更；项目经理在 `375x812` 和 `812x375` 验证首屏密度、触控、返回、滚动、截断、布局稳定性和无横向溢出。
5. 运行项目既有质量检查；当前无浏览器自动化依赖，保留带 URL、视口和截图的手工验收记录。

## 已确认决策

- 视口基准：`375x812` 竖屏和 `812x375` 横屏；推荐页首屏至少 4 条，归档页至少 5 条。
- F 型 Shelf 左侧是页面级分区 Tab，包含“推荐”和有文章的类型；右侧按分区展示文章卡片，滚动同步 active，点击滚动到分区首卡。
- F 型 Shelf 交互不修改 URL，不调用 history API，不产生新的浏览历史记录。
- 数据归一化由 Mobile BFF 完成；客户端只负责渲染、Scrollspy 和布局几何。
- 无抖动优先使用固定卡片几何；必要时允许 TS LayoutSnapshot + ResizeObserver 批量测量和滚动锚点补偿。
- 摘要可选、最多 160 个 Unicode 字符；空摘要合法并显示低强调占位。
- 推荐/归档页使用固定安全区底部双项导航，替换顶部主导航；详情页不显示底栏。
- B Desktop 只增加摘要字段闭环；PC 公共页面不改视觉。

## 交付记录

2026-09-05：原始摘要闭环已完成，但原“每条文章左侧类型锚点”的 F 型实现被用户否定。本次计划修订为 Mobile BFF + 页面级分区 Shelf，原有 Mobile 代码和已完成状态不视为本轮交付。浏览器自动化依赖未安装，固定视口验收保留为后续门禁。

2026-09-05：视觉、后端 BFF 和 Mobile 前端已完成并完成集成。BFF `GET /api/public/mobile/article-shelf` 以 sections 返回推荐和类型分区；Mobile 直接渲染 sections，以 IntersectionObserver 同步左侧 active，并且点击分区不修改 URL/history。已通过 Go 测试、Web 核心测试、类型检查、lint 与 `ops delivery build`。运行态在 `127.0.0.1:8091` 验证无筛选返回 100 篇、3 条推荐和 6 个类型分区，`type_id=1` 返回 17 篇且隐藏推荐。保留 `375x812`/`812x375` 手工视觉验收为计划关闭前的剩余门禁。

2026-09-05：用户确认 F-Shelf 交互和衔接动画满足预期。点击分区的目标锁定已消除程序滚动途中的连续 Tab 高亮，active 指示条使用非几何动效并尊重 reduced-motion。用户授权关闭计划并归档。
