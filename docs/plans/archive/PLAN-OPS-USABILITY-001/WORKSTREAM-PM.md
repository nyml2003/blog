---
kind: workstream
id: WORKSTREAM-OPS-USABILITY-PM
status: completed
plan_id: PLAN-OPS-USABILITY-001
role: project-manager
owner: project-manager
depends_on: []
write_set: [docs/plans/active/PLAN-OPS-USABILITY-001/]
last_reviewed: 2026-09-05
---

# 计划协调与集成验收

## 目标

协调入口、产品、CLI 和测试工作流，保证重入时保留状态和证据，并完成项目级 ops 入口与帮助体验的集成验收。

## 验收

- 依赖顺序和 write set 无冲突；重入不会重置已完成工作流。
- `SPEC-OPS-USABILITY-001` 的入口、帮助、错误和兼容性场景都有实现或测试证据。
- 最终结果记录 `direnv exec`、`nix develop`、根目录、嵌套目录和项目外失败的可复现命令。
