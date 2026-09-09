---
kind: plan-result
id: RESULT-CODE-LAYOUT-001
plan_id: PLAN-CODE-LAYOUT-001
status: completed
completed: 2026-09-09
owner: project-manager
---

# 代码布局与命名治理结果

用户 2026-09-09 以目标指定完成（含 R0 授权），R0-R3 于 09-09~09-10 交付，`ops quality check` 全绿。

## 已交付

- R1 命名：`ops/application/check.ts`→`quality-check.ts`、`ops/domain/runtime.ts`→`runtime-plan.ts`；
- R2a：`desktop/src/app.tsx` 拆为 `shell/`（单导出组件 + `format.ts` 工具 + index 出口）；`mobile/src/components/ui.tsx` 拆为 8 个单导出组件 + `shelf-format.ts` + index；
- R2b：`solid/queries/public.ts` 拆为 `articles.ts` / `shelves.ts` / `taxonomy-public.ts`（`index.ts` 出口不变，页面零改动）；
- R2c：`common/client/client.ts`(842 行) 拆为 `api-client.ts` + `routes-contract.ts` + `request-kit.ts` + `domains/`×7（出口 `index.ts` 不变）；
- R3：文件形态约定（A 多导出成员独立 / B 单导出）写入 `docs/guides/typescript-style.md`；CODEMAP/GLOSSARY 同步；R0 决策与偏差见 `R0-DECISIONS.md`。

提交：`4d2cf3b`、`7eb4dd3`、`5e65a6c`、`c22be36`、`bff9a79`。

## 遗留

- `common/client/domain.ts` 类型表逐领域迁移（低价值高扰动，未做）；
- 页面文件存在 import-only 路径变更（逻辑零改动，见 R0-DECISIONS 偏差记录）。
