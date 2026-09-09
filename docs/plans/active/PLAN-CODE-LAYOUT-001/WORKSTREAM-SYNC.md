---
kind: plan-workstream
id: WORKSTREAM-SYNC
plan_id: PLAN-CODE-LAYOUT-001
owner: infra
status: ready
last_reviewed: 2026-09-09
---

# 门禁与文档同步（R3）

## 职责

R1/R2 落地后，把所有"按路径/文件名说话"的规则与文档对齐最终布局，防止文档漂移回潮。

## 事项

1. `ops/src/domain/architecture.ts`：逐条规则核对是否引用了被重命名/拆分的文件，必要时更新；规则测试（`architecture.test.ts`）同步；
2. `docs/architecture/frontend.md`：目录边界描述与实际一致；
3. `docs/CODEMAP.md` / `docs/GLOSSARY.md`：目录明细与"已知布局痛点"节更新（痛点清零后删除该节或改写为"已治理"）；
4. 全量 `ops quality check` 终验 + 浏览器抽查一个公开页与一个管理页（链接经 site-routes 下发仍正常）。

## Write set

`ops/src/domain/architecture*.ts`、`docs/architecture/frontend.md`、`docs/CODEMAP.md`、`docs/GLOSSARY.md`。

## 完成定义

门禁绿；文档中不再存在指向旧路径/旧文件名的引用（`grep -r` 抽查）。
