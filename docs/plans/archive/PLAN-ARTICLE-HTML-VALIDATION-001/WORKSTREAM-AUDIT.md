---
kind: workstream
id: WORKSTREAM-ARTICLE-HTML-VALIDATION-AUDIT
status: completed
plan_id: PLAN-ARTICLE-HTML-VALIDATION-001
role: backend-operations
owner: backend-operations
depends_on: [WORKSTREAM-ARTICLE-HTML-VALIDATION-PRODUCT, WORKSTREAM-ARTICLE-HTML-VALIDATION-PARSER]
write_set: [docs/plans/archive/PLAN-ARTICLE-HTML-VALIDATION-001/, scripts/, blog.db 测试文章及关联]
last_reviewed: 2026-09-06
---

# 存量正文审计与迁移预案

## 目标

在不改写数据库的前提下，评估当前和未来历史正文对候选 Profile 的兼容性，并把风险变成可复现、可回滚的处理方案。

## 输入

- 当前 SQLite schema 与文章数据；
- 候选或确认后的 HTML Profile；
- 产品负责人确认的存量策略。

## 输出

- 审计范围、执行命令、Profile version、结果摘要和文章 ID 清单；
- 每类违规的修复建议；
- 迁移、隔离或保留展示方案，以及备份和回滚前置条件；
- 不包含正文原文或敏感内容的验收记录。

## 实施任务

1. 定义只读审计方式，避免测试或工具对生产数据库写入。
2. 按规则分类存量正文，区分可修复、需人工处理和高风险内容。
3. 对每个会写入的建议给出先备份、验证、回滚的步骤。
4. 将最终策略交给项目经理和产品负责人确认。

## 测试/验收

- 审计可在副本上重复执行并得到稳定结果；
- 没有任何批量内容修改发生在用户确认前；
- 若不存在存量文章，也需留下空结果的证据，而非跳过审计。

## 交付记录

- 2026-09-05：完成 `blog.db` 只读形态审计，记录于 `AUDIT-2026-09-05.md`；共 102 篇文章（100 published、2 draft），观察到的元素仅为 `h2`/`p`，未发现属性或粗粒度高风险形态。
- 2026-09-06：根据 v1 产品决策确认现有文章均为测试数据，后续在 Rust Product/Profile 接入完成后删除并按合法 fixture 重建；本轮没有数据库写入。
- 2026-09-06 实施：102 篇旧正文逐一通过正式 v1 校验。按用户授权先 `.backup`，再删除旧测试文章及文章关联，重建 3 篇合法 fixture 并验证外键。分类/标签定义保留；备份路径和 SHA-256 见 `RESULT.md`。
