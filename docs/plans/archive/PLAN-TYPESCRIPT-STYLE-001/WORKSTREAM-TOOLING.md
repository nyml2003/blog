---
kind: workstream
id: WORKSTREAM-TYPESCRIPT-STYLE-TOOLING
status: completed
plan_id: PLAN-TYPESCRIPT-STYLE-001
role: frontend-core
owner: frontend-core
depends_on: [WORKSTREAM-TYPESCRIPT-STYLE-SPEC]
write_set: [web/配置文件, docs/guides/]
last_reviewed: 2026-09-05
---

# 工具与评审落地

## 目标

基于当前仓库的 `oxlint`、`Biome` 和 `tsc`，区分可以机械检查的规则和必须通过 code review 判断的认知复杂度问题。

## 输出

- `oxlint` lint 规则和 `Biome` format 规则建议；
- `tsc` 类型约束建议；
- 不适合机械化的 review checklist；
- 试运行结果和误报记录。

## 约束

- 不因为 `oxlint` 规则方便就禁止所有三元或短路表达式；
- 不在本计划中批量格式化存量代码；
- 新规则必须说明对新代码、存量代码和测试代码的适用范围。

## 验收

- 工具规则不会改变运行时行为；
- 误报和例外有明确处理方式；
- 规范文档和 `oxlint`/`Biome`/`tsc` 配置互相引用。

## 交付记录

已在规范文档中固化机械规则与人工 Review 的职责边界，并明确不把所有三元、逻辑运算符或个人偏好变成机械禁令。实际配置修改、全量扫描、误报基线和质量门禁落地移交后续治理计划；本工作流未修改配置或源码。
