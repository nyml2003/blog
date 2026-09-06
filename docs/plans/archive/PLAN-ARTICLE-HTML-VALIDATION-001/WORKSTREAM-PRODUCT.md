---
kind: workstream
id: WORKSTREAM-ARTICLE-HTML-VALIDATION-PRODUCT
status: complete
plan_id: PLAN-ARTICLE-HTML-VALIDATION-001
role: product-content-design
owner: product-content-design
depends_on: []
write_set: [docs/specs/SPEC-ARTICLE-HTML-VALIDATION-001.md, docs/plans/archive/PLAN-ARTICLE-HTML-VALIDATION-001/WORKSTREAM-PRODUCT.md]
last_reviewed: 2026-09-05
---

# HTML Profile 与生效策略

## 目标

将“文章是系统主题包裹的 HTML 片段”落实为可读、可实现、可测试的版本化 Profile，并完成影响作者工作流的产品决策。

## 输入

- 当前 Desktop/Mobile `.article-body` 的系统主题能力；
- 真实或代表性的文章 HTML；
- `PLAN.md` 中的已确认边界和四项待确认决策。

## 输出

- `SPEC-ARTICLE-HTML-VALIDATION-001.md`；
- 允许元素/属性/class/URL 的理由和禁止项；
- 诊断目录和作者可读反馈文案；
- 跨 WASM 与 Rust backend 复用的诊断 schema 和 Profile version 约束；
- 草稿、预览、发布和历史正文的状态表；
- 提交给用户的逐项决策问题及推荐值。

## 实施任务

1. 从现有系统主题和典型知识库写作抽取最小语义集合。
2. 明确 fragment 根级规则、嵌套规则、空内容、实体、链接、图片、代码块与表格规则。
3. 对每种不支持内容定义错误、警告或迁移提示，不把它模糊称为“非法 HTML”。
4. 先确认草稿/发布门槛，再确认外部资源、系统 class 和历史内容策略。

## 测试/验收

- 每一项允许或禁止规则都有正反 fixture；
- 产品负责人确认四项策略后，Spec 才能交给 Rust core、WASM 和后端实施；
- Profile 不允许与现有正文主题没有消费者的“通用 HTML”能力。

## 阻塞

- 未取得产品负责人对四项策略的确认时，不得进入会改变保存或发布行为的后端实施。

## 交付记录

- 2026-09-05：完成并确认 `docs/specs/SPEC-ARTICLE-HTML-VALIDATION-001.md` v1。
- 已确认草稿/发布门槛、图片禁用、链接必须显式携带 `target`/`rel`、正文禁止 `class`，以及测试数据删除后按合法 fixture 重建的存量策略。
- 下游 Rust core、WASM 和 B Desktop workstream 必须以 `article-html/v1` 和诊断 schema 为输入；服务端接入前不得宣称公开路径安全已闭合。
