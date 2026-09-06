---
kind: workstream
id: WORKSTREAM-ATOMS-BATCH2
status: completed
plan_id: PLAN-MOBILE-ATOM-EXPANSION-001
role: frontend-mobile
owner: frontend-mobile
depends_on: []
write_set:
  - src/frontend/mobile-ui/atoms/tag.tsx
  - src/frontend/mobile-ui/atoms/tab.tsx
  - src/frontend/mobile-ui/atoms/chip.tsx
  - src/frontend/mobile-ui/atoms/text.tsx
  - src/frontend/mobile-ui/atoms/link.tsx
  - src/frontend/mobile-ui/atoms/index.ts
  - src/frontend/mobile-ui/atoms/types.test.ts
  - src/frontend/mobile-ui/molecules/
  - src/frontend/mobile-ui/styles/atoms.css
  - src/frontend/mobile-ui/styles/molecules.css
  - src/frontend/mobile-ui/styles/themes.css
  - docs/plans/archive/PLAN-MOBILE-CSS-ARCHITECTURE-001/ATOM-CONTRACT.md
  - docs/plans/archive/PLAN-MOBILE-CSS-ARCHITECTURE-001/COMPONENT-LIBRARY.md
  - docs/plans/active/PLAN-MOBILE-ATOM-EXPANSION-001/
  - docs/specs/SPEC-MOBILE-ATOM-EXPANSION-001.md
last_reviewed: 2026-09-06
---

# 工作流：原子与分子实现（R0–R1）

## 目标

冻结 batch 2 契约并实现新原子（Tag / Tab / Chip / Text accent / Link cta 待核）与首批分子（TabGroup / ChipGroup / StateMessage），含主题取值与全套类型契约测试。

## 输入

- Spec：`SPEC-MOBILE-ATOM-EXPANSION-001`（契约表）；
- 既有模式：`mobile-ui/atoms/define.ts` 的 `defineAtom`、`types.test.ts` 负样例模式、`atoms.css` 所有权规则、`themes.css` 主题作用域（主题计划在途，写集串行协调）；
- 视觉证据：`shelf.css:22-68`（tab 指示条与动效）、`shelf.css:169+` / `components.css:80+`（tag 截断）、`pages.css:11`（eyebrow）、home `primary-action`（R0 核对）。

## 输出

- R0：batch 2 原子契约写入 ATOM-CONTRACT 修订记录（含 Props 形状、枚举、非目标）、COMPONENT-LIBRARY 增补、`Link cta` 视觉核对结论；
- R1：
  - 原子：`Tag` / `Tab`（竖横两向）/ `Chip` / `Text tone "accent"`（/ `Link variant "cta"` 如成立），全部走 `defineAtom` + defaults 锚定；
  - 分子：新目录 `mobile-ui/molecules/`（`TabGroup` roving 键盘、`ChipGroup` 单选横滚、`StateMessage` 三 kind），`molecules.css` 独立文件，只依赖 `tokens.css` / `base.css` / `atoms.css`；
  - 主题：`themes.css` 为新原子 / 分子补 dark / sepia 作用域取值（含 `color-scheme` 一致性）；
  - 测试：`types.test.ts` 扩负样例与 defaults 合并；分子键盘 / 受控 / aria 测试；依赖边界检查（分子不得导入业务 / 数据 / 路由）。

## 实施任务

1. R0 契约与基线（契约须用户审定后进 R1）；
2. 原子实现 + 测试；
3. 分子实现 + 测试；
4. 主题取值（与主题计划 PM 串行）；
5. Spec 证据回填。

## 测试/验收

- `pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿，九原子契约测试不回归；
- 分子键盘走查（方向键循环、焦点可见、aria）；
- 新组件在 dark / sepia 作用域下的对比度抽查（≥4.5:1）。

## 阻塞

- 无。用户已确认当前范围交付；后续平铺页和 legacy 清理另立计划。

## 交付记录
