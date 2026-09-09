---
kind: plan-record
id: R0-DECISIONS
plan_id: PLAN-CODE-LAYOUT-001
status: confirmed
last_reviewed: 2026-09-09
---

# R0 决策记录（用户以 2026-09-09 目标"完成这个 plan"授权执行）

## 命名清单（终版）

| 现名 | 决定 |
| --- | --- |
| `ops/src/application/check.ts` | → `quality-check.ts`（同步 `check.test.ts` → `quality-check.test.ts`） |
| `ops/src/domain/runtime.ts` | → `runtime-plan.ts`（纯函数规划矩阵；`application/runtime.ts` 保留原名，路径已消歧） |
| `http.rs` ×3、`queries/core.ts`、`common/client/domain.ts` | 保留（路径/角色已消歧；core=查询基础设施 A 形态、domain=类型表 A 形态） |

## 拆分清单（终版）与形态分类

| 产物 | 形态 |
| --- | --- |
| `desktop/src/shell/{header,article-table,public-shelf,status,article-body,t-shelf}.tsx` | B（单导出组件） |
| `desktop/src/shell/format.ts`（qs/date/shortDate） | A（独立工具） |
| `desktop/src/shell/index.ts`、`mobile/src/components/index.ts` | 出口桶（re-export） |
| `mobile/src/components/{mobile-nav,article-row,article-card,shelf-section,mobile-t-shelf,article-body}.tsx` | B |
| `mobile/src/components/shelf-format.ts`（shortDate/sectionTypeId/pageStyles） | A |
| `queries/{articles,shelves,taxonomy-public}.ts`（由 public.ts 拆出） | A（hook 集，成员独立） |
| `client/{api-client,routes-contract}..ts` + `client/domains/*.ts` | routes-contract=A（契约表）；api-client=组合根（B：createClient）；domains/*=A |

## 与计划的偏差（已记录）

1. **页面文件允许 import 路径变更**（`../../app`→`../../shell`、`../components/ui`→`../components`），逻辑零改动。原表述"页面零 diff"放宽为"import-only diff"——为彻底消灭通用名 `app.tsx`/`ui.tsx`，且变更可机械审查；
2. `common/client/domain.ts` 本轮**不**逐领域迁移类型（保留 A 形态类型表），记为 follow-up；
3. 源码文本测试（admin-workflow-state / editor-state）随代码重定向到新文件，断言意图不变。

## 零行为变化护栏

golden（routes.json）、前端全部测试、ops 契约测试、Rust 全量测试原样通过；`ops quality check` 全绿。
