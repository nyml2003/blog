---
kind: plan-result
id: RESULT-DESKTOP-UI-001
plan_id: PLAN-DESKTOP-UI-001
status: completed
completed: 2026-09-09
owner: frontend-desktop
---

# Desktop UI 组件库内部开发结果

## 结果

已依据现有 Desktop 页面重复证据建立隔离的 `src/frontend/desktop-ui`。第一批只准入
`Button`、`ActionLink`、`Field` 与 `StateMessage`，完成类型、Solid SSR、依赖边界、样式
所有权和独立浏览器 bundle 编译测试。现有 Desktop/Mobile 页面与 shell 未接入该库。

## 已交付

- atoms：保留原生 action/navigation 语义边界的 `Button` 与 `ActionLink`；
- molecules：只关联 label/control 的 `Field`，以及映射稳定 ARIA 的 `StateMessage`；
- 样式：仅拥有 `.d-ui-*` 根 selector，复用 Desktop 语义变量，补齐可见焦点、禁用、忙碌
  和错误反馈；
- 测试：`@ts-expect-error` 负契约、Solid SSR 结构、禁止跨平台/数据依赖、CSS ownership、
  Vite library-mode showcase 构建；
- 自动化：`test:desktop-ui` 纳入 `test:core`，架构检查覆盖 Desktop UI 与 Mobile UI 双向
  隔离，以及 Desktop UI 对 common client 的禁止依赖。

## 有意缓建

- `Text` / `Heading` / `Eyebrow` 目前只有 class 复用，没有独立行为或协议；
- Input / Textarea / Checkbox 的现有表单协议仍有明显差异；
- Shelf / Table / Header / ArticleBody / Tabs 继续留在业务 shell 或页面；
- Modal / Popover / IconButton 尚无两个稳定消费者。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| `nix develop ./nix -c pnpm -C src/frontend run test:desktop-ui` | 6 passed |
| `nix develop ./nix -c pnpm -C src/frontend run test:core` | Desktop UI 6 passed，原有核心 108 passed |
| `nix develop ./nix -c ops quality check` | 全部通过：Rust、ops、typecheck、lint、format、测试、build、architecture |
| `git diff --check` | 通过 |
| 产品目录 `rg` Desktop UI 引用 | 无引用 |

## 证据限制

- 本轮按目标不接入产品页面，因此没有产品 DOM 变化，也不做页面截图或真实浏览器视觉验收；
- 内部 showcase 仅作为无页面入口的 Vite library-mode 编译 fixture，不登记为产品页面；
- `no-mistakes axi` 因当前仓库尚未执行 `no-mistakes init` 无法启动；未擅自初始化、建分支、
  提交或推送，交付质量由项目正式 `ops quality check` 完整验证。

## 后续边界

页面接入必须另立迁移计划，逐个消费者替换并做 Desktop 浏览器视觉与交互验收。缓建组件只有
在出现稳定语义和至少两个明确消费者后再准入，不能因目录已经存在而复制 Mobile 全量清单。
