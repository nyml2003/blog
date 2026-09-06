---
kind: workstream
id: WORKSTREAM-OPS-USABILITY-CLI
status: completed
plan_id: PLAN-OPS-USABILITY-001
role: frontend-core
owner: frontend-core
depends_on: [WORKSTREAM-OPS-USABILITY-PRODUCT]
write_set: [ops/src/interface/, ops/src/domain/]
last_reviewed: 2026-09-05
---

# CLI 帮助与错误体验

## 目标

基于现有 registry 元数据改进帮助渲染、路径解析和错误提示，不改变命令执行语义。

## 输出

- 根帮助的叶子命令清单；
- 分组/叶子帮助层级；
- 未知命令、分组直呼、未知选项和参数错误的引导；
- 命令示例和常用工作流提示。

## 约束

- `ops help <path>`、`ops <path> --help` 和 `ops <path> help` 等价；已知分组直呼展示帮助并返回 `0`；
- 不维护第二份硬编码命令清单；
- 不删除或改名现有命令；
- 叶子命令的 `--dry-run`、参数语义和有效执行退出码保持兼容。

## 验收

- 根帮助列出叶子命令；
- 分组帮助只列直接子命令并提供继续查看方式；
- 错误信息包含修正建议和帮助入口。
- registry 中所有叶子命令都有描述、示例和执行/用法退出码。
