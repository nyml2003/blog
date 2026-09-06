---
kind: workstream
id: WORKSTREAM-AUDIT
status: completed
plan_id: PLAN-ARCH-BOUNDARY-001
role: backend
owner: backend
depends_on: []
write_set:
  - docs/plans/active/PLAN-ARCH-BOUNDARY-001/AUDIT-REPORT.md
  - docs/plans/active/PLAN-ARCH-BOUNDARY-001/
  - docs/specs/SPEC-ARCH-BOUNDARY-001.md
last_reviewed: 2026-09-07
---

# 工作流：边界审查（R0）

## 目标

只读审查全库分层违规，产出审查报告与治理方案：违规清单（file:line + 分类 + 严重度）、目标落位、查询层位置定稿建议。**不改任何代码。**

## 输入

- Spec 两节"现状违规实例"（起点清单，非全集）；
- 全库：`src/frontend/{mobile,desktop,mobile-ui,common,solid}`、`src/backend/{product,data,mock}`、`src/core`；
- 在途计划的写集声明（违规项若落在在途写集内，标注"随该计划交接后治理"）。

## 输出

- `AUDIT-REPORT.md`：
  - 前端：页面越权清单（client import / useDataResource / createDataTask / 参数映射 / 组合根渗透）、业务组件越权；
  - 后端：http.rs 决策点清单（BFF 逻辑逐处摘出）、wire.rs / protocol 内编排行为清单、Data 层越权检查；
  - 每项标注：目标层、迁移策略（纯移动 / 需新建模块）、是否与在途写集冲突、严重度（阻塞级 = 边界持续腐化源）；
- 查询层落位建议（含两端共享 vs 每端自建的取舍分析）；
- 豁免清单初稿（供 R1 登记）。

## 实施任务

1. 全库扫描（可脚本辅助：import 图 + 人工判定语义归属）；
2. 报告与建议成文；
3. **报用户审定**（报告 + 查询层落位）后交 R1/R2/R3 消化。

## 测试/验收

- 报告覆盖 Spec 起点清单全部条目并能指出更多；
- 每条违规可执行（有明确目标落位与迁移策略）；
- 用户审定记录在案。

## 阻塞

无。

## 交付记录

- 2026-09-07：R0 只读审查完成并形成 `AUDIT-REPORT.md`；用户审定查询层落位为 `src/frontend/solid/queries/`，共享无 UI 查询逻辑并保持两端 UI 隔离。
