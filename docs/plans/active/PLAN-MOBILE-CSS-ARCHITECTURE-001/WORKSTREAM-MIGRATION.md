---
kind: workstream
id: WORKSTREAM-MOBILE-CSS-MIGRATION
status: in_progress
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
role: frontend-mobile
owner: frontend-mobile
depends_on: [WORKSTREAM-MOBILE-CSS-AUDIT]
write_set: [web/mobile/styles.css, web/mobile/**/*.css, web/mobile/src/**/*.tsx]
last_reviewed: 2026-09-05
---

# CSS 与 Class 迁移

## 目标

按审计确认的职责边界迁移 CSS 和必要 class，不改变页面功能或未确认的视觉设计。

本工作流的可执行步骤、模块 write set、R0-R6 回滚门与禁止项已冻结在
[`MIGRATION-RUNBOOK.md`](MIGRATION-RUNBOOK.md)。本文件只定义工作流授权边界；Runbook
不是实施授权，状态为 `ready` 时不得开始改动消费者。

## 约束

- 每次迁移保持构建和视觉可验证；
- class 只在职责变得更清晰时改名或新增；
- 不通过 `!important` 或页面父选择器解决迁移冲突；
- 不引入 CSS-in-JS、inline style 或运行时 CSS 字符串；
- 不使用 DOM `data-*` 属性传递业务数据、状态或样式参数；
- 组件逻辑只切换 class/语义属性，动态值优先回到预定义 token 或 class 组合；
- 保留受控文章 HTML 的语义选择器，不要求文章作者添加 class。

## 验收

- 模块 import 顺序和依赖方向明确；
- class 不再承担多个无关场景；
- 详情页和文章 body CSS 独立可定位；
- 不出现样式丢失、可访问性或交互回归。

开始前必须通过 [`REGRESSION-BASELINE.md`](REGRESSION-BASELINE.md) 的 CSS 迁移开工 gate。
完成后才能把本工作流标记为 `completed`；原子消费仍属于 Runbook R6 的独立后续工作，不得
在本工作流内提前实施。

## 交付记录（2026-09-06，R1-R5 完成）

- 五个独立回滚 commit：R1 `d192b75`（tokens 68 行 + base 45 行）、R2 `245b88b`（shell 90 + layout 预留空模块）、R3 `5c0ab70`（components 124 + shelf 175）、R4 `bc57a6e`（filter 145，合并旧 filter.css）、R5 `744710b`（detail 85 + article-body 70 + pages 70 + 三页入口切换为固定顺序 tokens→base→shell→layout→components→shelf→filter→detail→article-body→pages）。
- **等价性证据**：迁移前后构建产物逐规则比对，129=129 条选择器规则；9 组差异恰为一对一改名（`.active`→`.is-active`×2、`.empty`→`.is-empty`×2、`.loading/.error`→`.is-loading/.is-error`、`.filter-trigger span:last-child`→`.filter-trigger-count`、`.primary-action/.apply-button` 与 `.page-heading h1/.detail-header h1` 按拥有者拆分），声明逐字相同；38 处 CHANGED 全部为原始色值/尺寸/层级→等值 token 替换，无计算值变化。模块内零 raw color（颜色仅存 tokens.css 22 处）；`.check !important` 按字段布局/行布局拆分消除；仅存既有 reduced-motion 守卫 3 条 `!important`（base.css 注释说明，非迁移新增）。
- **裁决记录**：inventory 指向 atoms 的 7 条规则（eyebrow、page-heading/detail-header、subtle/meta、primary-action、retry-button、filter 表单控件、apply/clear）因原子冻结落在 pages/components/filter 并注释 R6 归属；layout.css 无 selector 映射保留空模块稳定 import 顺序；9 个既有调色板 token 名冻结（atoms.css 已消费）。
- **回滚锚点**：旧 `styles.css`（727 行，DEPRECATED 头注）/`filter.css`（17 行）保留无人导入；R1-R4 期间旧锚点与 JSX 同步最小编辑，每个 commit 页面渲染一致。孤儿 selector（`.back-button`、`.meta`）未删，注释标去向，建议 R6 前清理。
- 每步门禁（typecheck/lint/format:check/test:core 28 测试）exit 0；PM 复验 `ops quality check` exit 0、build exit 0。
- **Deferred**：视觉/交互回归由用户人工验收（PM 2026-09-06 决策）；R6 原子接入单独审批；Cascade Layer 不启用（模块单一所有权 + pages 最后导入已消除冲突）；motion token、46/48/50px 触控收敛、detail-meta 分隔符耦合留 R6 尺寸审计；旧入口文件删除待用户验收通过后裁决。
- 环境注记：一次 `ops quality check` 偶发 exit 20 源自 `ops/src/infrastructure/process.test.ts:74` SIGKILL 宽限计时断言（≥290ms），立即复跑即绿，与本迁移无关，建议 ops 侧放宽阈值。
