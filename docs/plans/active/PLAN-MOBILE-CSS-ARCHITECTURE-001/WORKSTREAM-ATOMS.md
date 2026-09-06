---
kind: workstream
id: WORKSTREAM-MOBILE-ATOMS
status: completed
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
role: frontend-mobile
owner: frontend-mobile
depends_on: [WORKSTREAM-MOBILE-CSS-AUDIT]
write_set: [src/frontend/mobile-ui/atoms/, src/frontend/mobile-ui/styles/atoms.css]
last_reviewed: 2026-09-05
---

# 独立 C Mobile 原子组件实现

## 目标

依据 `ATOM-CONTRACT.md` 和 `COMPONENT-LIBRARY.md` 实现 `Text`、`Heading`、`Button`、
`IconButton`、`Link`、`Label`、`Input`、`Select`、`Checkbox` 的 C Mobile 专属源码、统一
导出入口和独占 `atoms.css`。

这是不接入的基础库工作流：不得修改现有 `ui.tsx`、Mobile 页面、`styles.css`、
`filter.css`、业务 class 或任一现有组件的 import。组件库可以被 TypeScript 编译检查，
但不能成为当前页面运行时依赖。

## 实现约束

- 源码只能写入本工作流 write set；入口是 `src/frontend/mobile-ui/atoms/index.ts`，每个原子独立文件；
- CSS 只能写入 `src/frontend/mobile-ui/styles/atoms.css`，且只依赖已批准的 token/base 命名；当前不将它
  import 到页面入口，避免隐式接入；
- 必填 Props 由 TypeScript 表达；`IconButton.ariaLabel`、`Label.controlId`、`Link.href`、
  `Input.value/onInput`、`Select.content/value/onChange`、`Checkbox.checked/onChange` 必须另有
  运行时显式 fail-fast 校验；
- fail-fast 在所有环境抛出 `Error`，消息必须以 `C Mobile atom:` 开头并含组件名、无效字段和
  期望条件；不以默认值、console warning 或无操作回调掩盖无效配置；
- 只接受公开的枚举 option 值。未知值、`null`、非对象 `options` 和违反受控协议的值都立即失败；
- Button/Link 的语义、disabled/loading、ARIA、44px 目标、focus-visible、reduced-motion 和
  无布局抖动必须遵循契约；原子不导入 Client SDK、数据层、路由、业务组件或页面。

## 验收

1. TypeScript 能编译所有原子，且不存在业务 UI 导入原子入口的路径；已完成。
2. 每个原子输出规定的原生元素，互斥语义不混用；已完成。
3. 类型和运行时都拒绝缺少或无效的关键语义 Props；已完成，含组件级 fail-fast 单测。
4. `atoms.css` 有稳定 `.m-atom-*` root 和 `.is-*` 状态 modifier，不含页面布局、业务选择器、
  原始颜色或祖先覆盖；
5. 已重跑类型、lint、build、原子 fail-fast 单测；完整 `ops quality check` 和 `test:core` 结果记录在 PM 状态中，针对原子目录的人工 import 审计通过；
   既有格式失败必须与本工作流隔离记录；
6. `REGRESSION-BASELINE.md` 的原子接入 gate 仍保持未执行，直至独立消费者迁移任务获得 PM 批准。
