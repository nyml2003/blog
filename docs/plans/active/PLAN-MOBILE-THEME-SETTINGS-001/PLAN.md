---
kind: plan
id: PLAN-MOBILE-THEME-SETTINGS-001
status: in_progress
owner: project-manager
created: 2026-09-06
last_reviewed: 2026-09-06
---

# C Mobile 设置页与 mobile-ui 迭代

## 当前迭代状态

用户已逐项确认 [DECISIONS.md](./DECISIONS.md) 中的九项决策，本文件与 Spec、工作流现已按这些决策整合。组件边界见 [COMPONENT-CONTRACT.md](./COMPONENT-CONTRACT.md)。当前仍暂停代码、测试与验收；文档整合不代表恢复实施或接受首轮实现。

## 目标

按 [SPEC-MOBILE-THEME-SETTINGS-001](../../../specs/SPEC-MOBILE-THEME-SETTINGS-001.md) 在本计划内迭代 C Mobile 设置页，作为 mobile-ui 的首个完整页面用例。设置包含纸张 / 暗色 / sepia 主题与无衬线 / 衬线 / 等宽系统字体栈，设备本地持久化、即时生效、首绘前应用。PageContainer 承载整页主题，包含新页头、主体与新底部导航；其他旧页面保持现状。

## 成功标准

1. `/m/settings/index.html` 由既有底部导航第三项到达；设置页使用 PageContainer、PageHeader、BottomNav、Field 与独立 Select。
2. 设置页背景、留白、页头、主体、底部导航整体切换主题与字体；主题变量仅在 PageContainer 作用域覆盖，不改全局默认值。
3. Select 消费 `{ value, label }` 列表并通过 `onChange(value)` 返回选中值；Field 统一管理标签关联与表单项间距，页面不再拼原生 option 或用 p 包装 Label。
4. 数据访问遵循 Data -> Client -> Mobile 适配层 -> 页面；UI 不访问存储、不定义选项列表。首绘复用同一套读取和校验逻辑。
5. 无存储、非法值或读取失败时使用纸张 + 无衬线；非法值不回写。写入失败时当前页面选择仍生效。刷新与重新进入没有默认主题闪变。
6. 旧页面及 Desktop 不迁移；设置页保持默认纸张风格与系统无衬线。新 UI 的实际文字对比度 ≥ 4.5:1、focus 可见、原生控件 color-scheme 跟随，触控目标 ≥ 44px。
7. 恢复验收后完成前端 typecheck / lint / format:check / build / test:core、更新后的组件契约与设置专项检查。旧测试适配新批准的契约，不把旧 Props 负样例原封不动当作新验收标准。

## 非目标

- 不做跟随系统、网络字体、字号或行距设置，不新增后端设置 API。
- 不迁移旧页面，不重写 legacy 页头或导航；既有设置入口保留。
- 不增加新原子或通用表单引擎，只增加已确认的 Field、PageHeader、BottomNav 和 PageContainer，并修订 Select 的已确认接口及必要的 Field 接入。
- 不改 Desktop UI、既有 palette 名字、全局 token 默认值或无关原子 API；不进行跨端 UI 共享。

## 约束与依据

- 事实：`FACT-PRODUCT-001`（个人技术知识库博客，单机低依赖）；
- Spec：`SPEC-MOBILE-THEME-SETTINGS-001`（本计划交付并验收）；
- 归档契约：[ATOM-CONTRACT.md](../../archive/PLAN-MOBILE-CSS-ARCHITECTURE-001/ATOM-CONTRACT.md) 保留为历史基线；新批准的 Select、组合层和容器主题由本计划契约修订，实施交付时追加修订记录，不覆盖历史证据。
- 当前已有首轮设置页实现，但仍为 atom 根主题和 Mobile 直接存储方案，不能据此认为已满足新目标。Mobile 为 MPA，首绘装配必须兼顾 Vite dev 与静态构建产物。
- `common/data` 不包含设置业务类型，mobile-ui 不依赖 Client、数据访问、路由或 legacy 业务组件。Field 接入不能造成 atoms 反向导入 molecules。
- 已确认的 API 和组件调整无需重复确认；超出这些决策的新能力、页面迁移或公共协议变化仍须用户裁决。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 前端（data / client / mobile-ui / mobile） | frontend-mobile | 本计划 Spec 与组件契约；共享配置接线前需完成并发协调 | 见 [WORKSTREAM-FRONTEND-MOBILE.md](./WORKSTREAM-FRONTEND-MOBILE.md) | in_progress，编码暂停 |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 集成验收

按 Spec 场景逐项验收：

- 当前不执行测试。恢复验收后按 Spec 场景核验数据边界、受控选择、Field 标签关联、整页主题与原生导航。
- 在 375x812 与 360px 下覆盖三主题 × 三字体、首绘、刷新、存储失败、触控、焦点和其他旧页面不变；新页头及底部导航计入主题范围。
- 构建和静态检查不能替代页面验收。Product 精确路由仍存在集成依赖，未解决前不能声称 integration 可用。
- 实际交付后再更新当前架构和归档契约修订记录；Spec 只有证据充分时才推进 accepted。当前不修改 FACTS、不归档计划。

## 未决项

产品与分层方向已经确认；具体 Props、Field 内部关联和同步首绘装配按组件契约由专业前端落实，不把实现细节重新变成产品待决项。实施前需协调 `vite.config.ts` 的并发修改；Product 设置页静态映射尚待原范围确认。当前代码和测试暂停指示仍有效。

## 执行上下文

- 2026-09-06：用户委任当前主线程为 PM，按 PM-PROMPT 接手执行；frontend-mobile 负责实现与实现证据，PM 负责计划状态、依赖和集成验收。执行记录见 [PM-STATUS.md](./PM-STATUS.md)。
- 启动检查确认本目录已有 Git 元数据；已有 Ops 参数相关改动和本计划的暂存文档，均保留。当前没有发现本计划源码写集的已有变更；运行中的其他编辑会话不视为已停止，后续修改仍须复核。
- PM 协调补齐导航任务必要写集：允许 `src/frontend/mobile/styles/shell.css` 仅将底栏两列调整为三列。目标、原子契约及主题作用域不变。
- 用户先暂停测试，随后要求讨论后在本计划迭代。九项决策已整合；首轮实现与检查只作历史证据，最新 Select 修复仍未由本线程复验。计划保持 in_progress，Spec 保持 draft，代码和测试不因本文整合自动恢复。
