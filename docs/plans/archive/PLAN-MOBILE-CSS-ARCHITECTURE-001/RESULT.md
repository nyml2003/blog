---
kind: plan-result
id: RESULT-MOBILE-CSS-ARCHITECTURE-001
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: completed
last_reviewed: 2026-09-06
---

# PLAN-MOBILE-CSS-ARCHITECTURE-001 结果记录

## 最终状态

completed（2026-09-06 用户裁定制归档）。

## 交付概览

- **审计与文档闭环**：STYLE-INVENTORY（selector→模块完整映射）、ATOM-CONTRACT（九原子契约，两度修订见修订记录）、COMPONENT-LIBRARY（调用方规范）、REGRESSION-BASELINE（五视口 × 19 场景判定标准）、MIGRATION-RUNBOOK（R0-R6 执行合同）。
- **原子库** `src/frontend/mobile-ui/`（自 `mobile/src/atoms` 抽取为独立顶层目录）：九原子 + `defineAtom` 类型即契约工厂（46 行）；运行时校验整体移除，`@ts-expect-error` 负样例（12 条）自守契约；组件代码 -31%（613→425 行）。
- **CSS 拆分 R1-R5**：`styles.css`(721 行)+`filter.css`(14 行) → 十模块（tokens/base/shell/layout/components/shelf/filter/detail/article-body/pages），三页入口切换固定 import 顺序；五个独立回滚 commit（`d192b75`→`744710b`）；原子未被页面消费（R6 边界维持）。

## 验证证据

| 项 | 结果 |
| --- | --- |
| CSS 等价性 | 迁移前后构建产物**逐规则比对 129=129**：9 组一对一改名（声明逐字相同）、38 处 raw 值→等值 token，零计算值变化；模块内零 raw color；`.check !important` 消除 |
| 类型契约 | `types.test.ts` 9 正样例 + 12 负样例（实测防回归：放宽 `LinkProps.href` 即 typecheck 红）+ defaults 合并断言 |
| 门禁 | 每阶段 typecheck/lint/format/test:core exit 0；`ops quality check` exit 0；build exit 0（含锚点删除后复验） |

## 验收裁定的如实记录

- **视觉/交互人工验收未执行**：用户 2026-09-06 裁定以静态等价性证据（逐规则比对）+ 门禁为归档依据，放弃迁移前后人工视觉对照（REGRESSION-BASELINE 的判定标准保留为未来页面迭代的参考契约）。
- **R6 原子消费迁移未实施**：页面仍用原生元素与业务 class；将来接入时另立计划（沿用 ATOM-CONTRACT 与本计划边界）。
- 旧锚点 `styles.css`/`filter.css` 已随归档删除（回滚依赖 git 历史）。

## 生效变化

- `src/frontend/mobile/styles/` 十模块取代单文件；`src/frontend/mobile-ui/` 新顶层组件库目录；
- ATOM-CONTRACT 修订记录：运行时 fail-fast → 类型即契约（放弃 JS 调用方/any 穿透/运行时组装 props/空内容四条运行时防线；`Link` `_blank`/`rel` 调用方自律）。

## 未决项（后续候选）

1. R6 原子接入（每次一个稳定业务边界，单独审批）；
2. 孤儿 selector 清理（`.back-button`、`.meta`，注释已标去向）；
3. duration/motion token 化、触控高度 46/48/50px 收敛、detail-meta 分隔符耦合（R6 尺寸审计范围）；
4. 视觉人工抽查可随时按 REGRESSION-BASELINE 执行（该文档判定标准长期有效）。

## 关键决策记录

- 2026-09-05（交接前）：审计四件套冻结、原子独立实现不接入、CSS 迁移待 gate。
- 2026-09-06 用户：跳过自动化基线（人工验收替代）→ 后裁定直接归档；原子 API 两度演进（手写 fail-fast → 运行时规格机器被否 → **类型即契约**）；`Link` rel 接受调用方自律；组件库抽取至 `src/frontend/mobile-ui/`。
- PM：CSS 按 Runbook R1-R5 串行 + 每步独立 commit 回滚点；等价性以构建产物逐规则比对为证据形态。
