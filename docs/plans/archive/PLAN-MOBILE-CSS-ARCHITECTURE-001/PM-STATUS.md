---
kind: plan-pm-status
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: completed
owner: project-manager
last_reviewed: 2026-09-06
---

# PM 执行状态

## 当前阶段

样式依赖审计、原子 Props 契约、调用方组件库文档和页面回归基线已冻结。独立原子组件库已经实现并完成质量验证；当前仍不接入 `ui.tsx`、现有页面或现有样式入口。

当前交付还包括一份独立的 Mobile 原子组件库文档。它冻结组件的职责、原生语义、Props、状态、可访问性、样式边界、禁用能力与示例；实现完成后作为消费方接入的唯一规范，而不是把 API 选择分散在业务页面中。

## 审计交付写集

审计与文档工作阶段只读现有 Mobile 源码，并按下表写入各自独占的交付文件。原子实现工作流已经在其独占 write set 中完成；当前仍不接入现有业务 UI。CSS 迁移、页面与业务组件写集必须继续等待后续独立授权。

| 交付文件 | Owner | 依赖 | 写集与职责 |
| --- | --- | --- | --- |
| `ATOM-CONTRACT.md` | Mobile 组件实现 | 本文的原子决策、现有 JSX 用例 | 第一期开箱 API、受控状态、原生语义、a11y、禁止项和静态验证要求。 |
| `STYLE-INVENTORY.md` | Mobile CSS 架构 | 当前 Mobile JSX/CSS | selector/class 到当前归属、目标层级、候选模块和风险的完整映射。 |
| `REGRESSION-BASELINE.md` | Mobile 质量与设计 | 当前页面行为、现有测试入口 | 不接入前后的视觉、键盘、表单和状态回归场景，以及可自动化与人工验收边界。 |
| `COMPONENT-LIBRARY.md` | Mobile 组件文档 | `ATOM-CONTRACT.md` 与 PM 决策 | 面向调用方的原子库总览、安装/导入约定、组件索引、通用规则、示例和版本化/接入规则。 |

`COMPONENT-LIBRARY.md` 依赖 `ATOM-CONTRACT.md` 的 API 结论；在契约尚未审定时只能建立文档结构，不能自行扩展组件能力。四项交付现已完成审定，独立原子实现也已完成；后续只可按单独授权启动 CSS 迁移或原子消费者接入。

## 执行边界

- 范围限定为 C Mobile；不合并或复用 C Desktop 的 JSX、CSS 或 DOM 结构。
- 组件是样式收敛的首要单元：组件根 class 及其受控内部结构归组件模块所有。
- Shell、布局原语、页面局部结构和受控文章 HTML 主题不是组件内部样式；它们各自拥有独立模块，避免形成万能组件或万能页面文件。
- 页面负责路由场景、数据状态和组件编排；页面不得通过父选择器覆盖通用组件内部规则。
- 非标行为只归属到其稳定的交互边界：Filter Panel 负责焦点圈定、Escape、滚动锁定和恢复焦点；Shelf 负责 sticky 与 scrollspy；详情页负责阅读返回路径；文章主题只作用于 `.article-body`。
- 迁移不改变现有 002 详情页和文章正文的视觉或交互结果。它们在本计划内视为保护基线，完成拆分与回归后才重新开放给 002 迭代。

## C Mobile 原子优先决策

组件体系采用原子 -> 分子 -> 业务组件的依赖方向。第一期只建设当前页面已经使用的原子；任何分子、业务组件或页面迁移必须等待原子契约稳定。这样后续组件的扩展性来自组合，而不是把现有复合组件误归为基础层。

| 层级 | 当前成员或候选 | 第一期结论 |
| --- | --- | --- |
| 原子 | `Text`、`Heading`、`Button`、`IconButton`、`Link`、`Label`、`Input`、`Select`、`Checkbox` | 实现范围。只抽取已有排版、操作和 Filter 表单控件已证明的语义；每项建立独立 CSS 所有权与状态契约。 |
| 分子 | 表单字段、按钮组、状态块 | 暂不迁移。原子完成后审计重复的结构与交互，证明稳定边界才立项。 |
| 业务组件 | `MobileNav`、`BottomNav`、`ArticleRow`、`StateMessage`、`FilterPanel`、`ShelfIndex`、`ShelfSection` | 暂保留当前职责与 DOM，不作为基础层实现；后续只能消费原子，且不得反向定义原子样式。 |
| 页面局部结构 | 首页 action、文章库 heading/trigger、阅读栏、详情 metadata/footer | 暂不抽象；有稳定复用证据后才进入分子或业务层。 |
| 内容主题 | `ArticleBody` 与 `.article-body` | 保持独立主题边界，不进入组件库。 |

每个第一期原子，在迁移验收时必须满足：

- 使用正确的原生语义元素；链接与按钮不因共享外观而互换语义；
- 有清晰且不改变布局几何的 active、focus、loading、error 或 disabled 状态；
- 交互目标至少 `44px`，键盘焦点可见，状态不只用颜色表达；
- 动态文本、长标题和缩放文本不会溢出；组件不依赖页面祖先选择器改变内部表现；
- 仅依赖 token、base、shell 或 layout，不依赖分子、业务或页面模块的 CSS。

### 审计后实施决定

- 原子 CSS 的唯一文件为 `src/frontend/mobile-ui/styles/atoms.css`，不再把按钮或表单控件继续混入业务 `components.css`；它只依赖 `tokens.css`、`base.css`，并在后续 CSS 迁移中早于业务模块加载。
- 原子源码的唯一入口为 `src/frontend/mobile-ui/atoms/index.ts`；未来调用方只能通过这个入口具名导入，不深度导入实现文件。实现已包含九个原子、`defineAtom` 类型工厂与独占 `atoms.css`（2026-09-06 起不再有运行时配置校验 helper）。
- `FilterPanel`、Shelf、ArticleRow、导航、StateMessage、阅读页、文章正文和页面 JSX 在当前工作流中均为冻结消费者。原子库完整实现且独立验证后，才讨论单独的接入任务。
- TypeScript strict 的字面量联合与必填字段是原子 Props 的唯一防线（2026-09-06 用户决策，取代原先的"类型 + 运行时 fail-fast"双防线）。`defaults` 用 `satisfies` 编译期锚定，`types.test.ts` 的 `@ts-expect-error` 负样例固定契约；JS 调用方、`any` 穿透、运行时拼装 Props、空内容与 `Link` `_blank` 的 `rel` 组合不再有运行时抛错，详见 ATOM-CONTRACT「类型即契约」节。

## 原子与客户端基建的边界

原子组件必须是纯受控 UI。它们只能根据 Props 渲染，并通过回调向外通知用户操作；不得导入 Client SDK、Transport、Solid resource adapter、路由或全局状态，也不得自行请求、缓存、重试、取消、轮询、并发协调或保存领域状态。

`PLAN-CLIENT-SDK-001` 是请求与异步治理的唯一协作计划，其分层为 Data SDK -> 业务 Client SDK -> Solid resource adapter。第一期原子实现不依赖该计划完成，因为原子不读取数据；在原子被分子、业务组件或页面消费时，数据层只允许向下传递已归一化的显示 Props，例如 `value`、`checked`、`disabled`、`loading`、`invalid`、`errorMessage` 及事件回调。

```text
Data SDK -> Client SDK -> Solid adapter -> business component -> molecule -> atom
                                                  state/value/events ---------^
```

原子不得反向穿透该方向。请求失败、重试策略和业务状态转换由 adapter 或业务组件决定；原子只忠实呈现其传入的状态。

## 延期事项

本计划不引入 Web Components，不改造 HTML 编辑器，也不定义或实现文章内容组件、HTML allowlist、sanitization 或内容存储协议。`.article-body` 继续是现有受控 HTML 主题 wrapper；与富文本内容模型有关的需求必须作为独立计划，并在服务端验证与内容协议先行后再进入实现。

## 第一期原子 Props 决策

以下 contract 参考成熟组件库的可访问性和受控状态边界，但只保留现有 C Mobile 用例已经证明需要的能力。所有原子透传其对应原生元素的安全属性；不提供 `style` object、运行时 CSS 字符串、任意颜色值或业务数据 Props。

| 原子 | 第一期 Props | 明确排除 |
| --- | --- | --- |
| `Text` | `as`（`span` 或 `p`）、`tone`、`size`、内容 | 编辑、复制、受控省略、领域文案和数据格式化。 |
| `Heading` | `as`（现有 `h1` 至 `h3`）、`size`、内容 | 自动生成 heading level、折叠和页面布局。 |
| `Button` | 原生 `type`、`disabled`、`loading`、`variant`、`block`、`onClick`、内容 | `href`、请求执行、自动防抖、重试和提交状态管理。 |
| `IconButton` | `aria-label`、图标内容、`variant`、`disabled`、`loading`、`onClick` | 无标签图标按钮、自行选择图标库或动作语义。 |
| `Link` | `href`、原生链接安全属性、`variant`、内容 | 以 Button API 承担导航，或自行处理路由/历史。 |
| `Label`、`Input`、`Select`、`Checkbox` | 原生标识与表单属性、受控 `value`/`checked`、`disabled`、`invalid`、`onInput`/`onChange`、必要的 `aria-*` 关联 | 表单数据读取、校验规则、提交、错误归一化和跨字段状态。 |

`loading`、`disabled` 与 `invalid` 都是上层声明的显示状态，不是原子内部状态机。`Button` 与 `Link` 继续是不同原子，避免共享外观破坏原生语义。

## 已确认的迁移骨架

```text
tokens -> base -> atoms -> shell -> layout -> components
                              -> shelf
                              -> filter
                              -> detail -> article-body
                              -> pages
```

依赖只从业务模块指向 token、base、shell 或 layout；业务模块之间不互相覆盖。`detail.css` 可以使用共享 token、base 和布局，但不得包含 Shelf 或 Filter 规则；`article-body.css` 只使用 `.article-body` 和受控 HTML 语义选择器。

## 当前审计事实

- 现有 `web/mobile/styles.css` 为 721 行，`web/mobile/filter.css` 为 14 行；Filter 的 Panel、表单与操作栏规则仍在主文件，现有 `filter.css` 仅含日期网格。
- 稳定组件根 class 已存在：`.article-row`、`.state-message`、`.shelf-index`、`.shelf-section`、`.filter-panel`、`.article-body`、`.bottom-nav` 和 `.mobile-header`。
- 需要在迁移中解耦的跨职责选择器至少包括：`.page-heading h1, .detail-header h1` 和 `.filter-trigger, .back-button`。
- CSS 中还存在原始色值与透明色。审计将判断其是否应成为语义 token，而不在迁移前改变视觉值。

## 质量基线与阻塞项

2026-09-05 已在当前工作树重新运行 `ops workspace doctor`、`ops quality check` 和
`pnpm --dir web test:core`。workspace doctor、gofmt、go vet、go test、Ops 语法与合约测试、
Web typecheck、Oxlint、production build、依赖边界和 9 个 core/resource 测试均通过。

原子库交付后的当前质量门禁已全绿：`ops quality check`、`pnpm --dir web format:check`、
`pnpm --dir web typecheck`、`pnpm --dir web lint`、`pnpm --dir web build`、
`pnpm --dir web test:core` 和原子目录 fail-fast 单测均通过。此前记录的页面格式差异在当前
工作树不再复现；本轮没有为此修改现有页面。

## 下一关

`WORKSTREAM-MOBILE-CSS-AUDIT` 已完成，审计产物为 `STYLE-INVENTORY.md`、`ATOM-CONTRACT.md`、`COMPONENT-LIBRARY.md`、`REGRESSION-BASELINE.md` 和 `MIGRATION-RUNBOOK.md`。`WORKSTREAM-MOBILE-ATOMS` 已完成独立实现和验证；`WORKSTREAM-MOBILE-CSS-MIGRATION` 仍保持 `ready`，并继续拒绝对既有 Mobile JSX、`styles.css`、`filter.css` 或业务组件 class 的拆分/接入改动，直到 PM 另行批准消费迁移。

## 交接结论

交接入口为 [`HANDOVER.md`](HANDOVER.md)。本轮完成的是原子库的独立交付和 CSS 架构的可执行文档闭环：模块职责、class inventory、原子契约、调用方文档、迁移顺序、回滚门和回归验收已经冻结。没有以“文档已完成”冒充 CSS 拆分、浏览器回归或业务页面接入已经完成。

下一位负责人只能按以下顺序恢复：先满足 `REGRESSION-BASELINE.md` 的 fixture/证据/浏览器开工 gate，再按 `MIGRATION-RUNBOOK.md` 的 R0-R5 拆分 CSS 并完成回归，最后才可以单独立项 R6 原子消费迁移。任何新增原子 Props、分子或业务组件边界都需要 PM 再审定。

## 承接记录（2026-09-06）

新 PM 承接。核实：九原子、`config.test.ts` 6/6 通过、`atoms.css` 177 行独立、业务零消费、`styles.css` 721 行 / `filter.css` 14 行未拆分——与 HANDOVER 状态一致。注意：仓库已于 2026-09-06 重构为 `src/{core,backend,frontend}` 布局，本文档及交接文档中的 `web/mobile/...` 路径与 `pnpm --dir web ...` 命令均对应现在的 `src/frontend/mobile/...` 与 `pnpm -C src/frontend ...`；Go 门禁记录已随 Go 退场过时。恢复顺序不变：先满足回归开工 gate，再 R0-R5 拆分 CSS，R6 消费迁移单独审批。

## PM 决策（2026-09-06 晚）：跳过自动化基线，直接开始 CSS 迁移

用户裁定：REGRESSION-BASELINE 的开工 gate 中「迁移前截图基线」由用户在迁移完成后人工验收替代；阶段 A 自动化采集取消（agent 已中止）。静态质量门禁（typecheck/lint/format/build/test + ops quality check）仍为迁移每步的硬性验收。视觉/交互回归改为：迁移完成后用户人工对照验收，P0/P1 判定标准仍以 REGRESSION-BASELINE.md 为准。原子库已抽取至 `src/frontend/mobile-ui/`（atoms 入口不变）。WORKSTREAM-MOBILE-CSS-MIGRATION 即日起置 in_progress，按 MIGRATION-RUNBOOK R0→R5 执行，R6 消费迁移仍需单独审批。

## PM 决策（2026-09-06）：原子库改为「类型即契约」

用户批准以 `defineAtom` 类型工厂取代全环境运行时配置校验：删除 `config.ts` 的 12 个校验 helper 与九原子 render 内的全部校验样板（九组件 613 行 -> 425 行），运行时只剩 defaults 合并；`config.test.ts` 的 6 条运行时 fail-fast 测试删除，由 `types.test.ts` 的 12 条 `@ts-expect-error` 类型负样例、9 条合法组合与 1 条 defaults 合并断言取代。Props 接口与 `index.ts` 导出面不变，业务零消费，不影响 CSS 迁移。放弃的运行时防线（JS 调用方、`any` 穿透、运行时拼装 Props、空内容、`Link` `_blank` 的 `rel` 组合）已记录在 ATOM-CONTRACT「类型即契约」节。当前原子目录门禁：`ops quality check`、typecheck、lint、format:check、build 与 `tsx --test mobile-ui/atoms/types.test.ts` 全绿；`HANDOVER.md` 与 `REGRESSION-BASELINE.md` 中对 fail-fast 的描述已过时，待其各自维护者按写集更新。

2026-09-06（续）：用户裁决 `Link` `_blank`/`rel` 组合接受调用方自律，不引入判别 union；原子 API 重构（defineAtom 类型即契约）至此收尾，`HANDOVER.md` 已加过时注记指向现行契约。
