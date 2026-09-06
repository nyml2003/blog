---
kind: workstream
id: WORKSTREAM-MOBILE-CSS-AUDIT
status: completed
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
role: visual-design-and-frontend-mobile
owner: visual-design-and-frontend-mobile
depends_on: []
write_set: [docs/architecture/ui-ux.md, docs/plans/active/PLAN-MOBILE-CSS-ARCHITECTURE-001/]
last_reviewed: 2026-09-05
---

# 样式依赖审计与模块方案

## 目标

从现有页面、组件和 CSS 规则出发，定义实际的模块职责与 class 边界，避免凭文件名猜测结构。

## 输出

- class/选择器 -> 组件/页面 -> 目标模块 inventory；
- 全局 token、深层选择器、跨场景覆盖和重复样式清单；
- 迁移顺序和每一步的视觉回归范围；
- 对详情页和文章 HTML CSS 的稳定入口定义。
- C Mobile 组件目录：按原子、分子、业务组件、页面局部结构和文章 HTML 主题分类，并为每项记录当前消费者、语义元素、状态与样式所有权。第一期仅批准原子层进入迁移。
- 第一期开工前的原子 Props contract：列出原生属性透传范围、受控值/事件、显示状态、可访问性属性和明确不承担的数据/异步职责；以当前 C Mobile 消费者证明每个 Props 的必要性。

## 验收

- 每个模块有一句可验证的职责描述；
- 能解释 Filter、Shelf、详情和文章正文各自为什么不应互相覆盖；
- 不把简单局部规则过度拆分成无意义文件。

## 完成证据

- `STYLE-INVENTORY.md`：当前 selector/class 到目标职责和模块的完整映射；
- `ATOM-CONTRACT.md`：九个原子的受控 Props、a11y、禁止依赖与 fail-fast 要求；
- `REGRESSION-BASELINE.md`：不接入阶段和未来消费迁移的固定回归场景；
- `COMPONENT-LIBRARY.md`：调用方组件库总览、目录入口、使用规则与接入门槛。
- `MIGRATION-RUNBOOK.md`：CSS 模块拆分顺序、独占 write set、回滚门和不接入原子消费者的执行边界。
