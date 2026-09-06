---
kind: plan-handover
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: completed
owner: project-manager
write_set: [docs/plans/active/PLAN-MOBILE-CSS-ARCHITECTURE-001/HANDOVER.md]
last_reviewed: 2026-09-05
---

# C Mobile CSS Architecture 交接

> **过时注记（2026-09-06）**：本文是 2026-09-05 的交接快照。此后发生：原子库已迁移至 `src/frontend/mobile-ui/` 并改为「类型即契约」（运行时 fail-fast 校验已移除，见 `ATOM-CONTRACT.md` 修订记录与 `PM-STATUS.md` 的 PM 决策）；CSS 已按 Runbook R1-R5 拆分完成（交付记录见 `WORKSTREAM-MIGRATION.md`），视觉回归由用户人工验收。本文的路径与 fail-fast 描述以那三份文档为准。

## 交接结论

第一期 C Mobile 原子库和本计划的执行文档已完成并冻结；现有 Mobile 页面**没有**消费原子，
CSS 文件也**没有**开始拆分。该边界是有意保留的：先让原子 API、CSS 所有权和验收合同稳定，
再以可回滚的独立工作流迁移消费者。

当前计划仍是 `in_progress`，原因是 CSS 模块迁移、页面视觉/交互回归和原子消费迁移尚未开始，
不是文档或原子库未完成。

## 已完成交付

| 交付 | 状态 | 作为后续工作的作用 |
| --- | --- | --- |
| [`STYLE-INVENTORY.md`](STYLE-INVENTORY.md) | complete | 当前 selector/class、消费者、目标层级、唯一模块所有者与迁移风险。 |
| [`ATOM-CONTRACT.md`](ATOM-CONTRACT.md) | approved | 九个原子的 Props、原生语义、a11y、fail-fast 和禁止依赖。 |
| [`COMPONENT-LIBRARY.md`](COMPONENT-LIBRARY.md) | implemented-not-integrated | 调用方入口、示例、状态矩阵和 CSS 所有权。 |
| `src/frontend/mobile-ui/atoms/**`、`src/frontend/mobile-ui/styles/atoms.css` | completed | 独立的 `Text`、`Heading`、`Button`、`IconButton`、`Link`、`Label`、`Input`、`Select`、`Checkbox`。 |
| [`REGRESSION-BASELINE.md`](REGRESSION-BASELINE.md) | approved | 固定路由、视口、场景、失败等级、证据格式与迁移开工 gate。 |
| [`MIGRATION-RUNBOOK.md`](MIGRATION-RUNBOOK.md) | ready | CSS 模块顺序、write set、R0-R6 回滚门和禁止职责。 |

## 不得误判为完成的事项

- CSS 还没有从 `web/mobile/styles.css` 和 `web/mobile/filter.css` 拆到目标模块；
- 尚未建立可重复的本地 fixture、页面截图或浏览器交互证据；
- 现有业务组件、页面 JSX、Filter、Shelf、导航、详情页和文章正文没有接入原子；
- 没有创建分子组件，也没有改变 Client SDK、请求、异步、路由或全局状态边界；
- Desktop 不得导入、复制或反向约束 C Mobile 原子实现；
- Web Components、HTML 编辑器原子化和文章内容协议仍明确延期。

## 已冻结的工程决策

- 依赖方向是 `Data SDK -> Client SDK -> Solid adapter -> business component -> molecule -> atom`；
  原子只渲染 Props 并通过回调通知，不读取数据、不发请求、不管理异步或复杂状态。
- 第一批仅有九个已证明的原子。调用方只从 `src/frontend/mobile-ui/atoms/index.ts` 具名导入；不得深度导入。
- 原子 Props 使用完整必填 Props 对象加 `options: Partial<...Options>`。关键语义和受控协议同时
  受 TypeScript 与运行时保护。
- fail-fast 在所有环境中执行，DOM 创建前抛出 `C Mobile atom:` 前缀、组件名和字段名；不允许
  静默 fallback、console warning 或 no-op。
- `atoms.css` 只拥有 `.m-atom-*` 与受控 modifier，不能被页面祖先选择器覆盖；它当前不被页面入口 import。
- Link 与 Button 保持不同原生语义；`_blank` Link 必须显式提供含 `noopener noreferrer` 的 `rel`。

## 恢复执行顺序

1. 由下一位 PM/质量负责人完成 `REGRESSION-BASELINE.md` 的开工 gate：临时 fixture、状态注入、
   证据目录、浏览器/DPR/缩放/reduced-motion 约定，以及迁移前的页面基线。
2. 将 `WORKSTREAM-MOBILE-CSS-MIGRATION` 从 `ready` 明确改为实施中，按 `MIGRATION-RUNBOOK.md`
   的 R0 到 R5 顺序拆分 CSS。每一步只写自己的模块 write set，完成静态与页面回归后再切换入口。
3. CSS 迁移与页面回归完成后，单独审批 R6。每次只让一个稳定业务边界消费原子，并重新执行对应
   的原生语义、焦点、触控尺寸、状态几何和页面回归验收。
4. 只有 R6 也通过后，才讨论是否存在足够重复用例进入分子层；不能为了接入方便临时扩大原子 API。

## 质量证据

在本次交接前，以下命令在当前工作树通过：

```text
ops workspace doctor
ops quality check
pnpm -C src/frontend exec tsx --test mobile-ui/atoms/config.test.ts
pnpm --dir web typecheck
pnpm --dir web lint
pnpm --dir web format:check
pnpm --dir web build
pnpm --dir web test:core
```

这证明原子库的静态质量、独立 fail-fast 契约、项目构建和既有 core/resource 测试处于绿色状态；
它不替代未实施 CSS 迁移的浏览器视觉、键盘、滚动与真实 fixture 验收。

## 交接时的写集状态

| 工作流 | 状态 | 后续可写范围 |
| --- | --- | --- |
| `WORKSTREAM-MOBILE-CSS-AUDIT` | completed | 不再修改已冻结的审计结论，除非 PM 明确重开。 |
| `WORKSTREAM-MOBILE-ATOMS` | completed | 原子目录仅用于独立缺陷修复或 PM 审定的 API 变更。 |
| `WORKSTREAM-MOBILE-CSS-MIGRATION` | ready | `web/mobile/styles.css`、目标 CSS 模块和必要的 Mobile JSX class；不得自动接入原子。 |
| `WORKSTREAM-MOBILE-CSS-TESTING` | ready | 视觉测试与验收记录；先建立 fixture 和证据目录。 |
| 原子消费 R6 | not-started | 必须单独建任务，不能混入 CSS 拆分。 |

任何与上述范围冲突的需求，尤其是 Desktop UI、数据/异步基建、002 详情密度改造、内容编辑器或
Web Components，都应回到 PM 重新分配 write set 和验收条件。
