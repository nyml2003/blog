---
kind: guide
id: GUIDE-DEVELOPMENT
status: current
owner: project-manager
last_reviewed: 2026-09-05
---

# 开发指南

采用持续流，不强行凑固定 Sprint。新需求先进入一个 plan，再拆成可验收的工作流。

## 并行规则

- 产品、视觉、前端、BFF、后端、基建和运维可以作为不同 workstream；
- 每个任务声明 owner、依赖和 `write_set`；
- 不修改同一写集的任务可以并行；
- 写集重叠时先完成契约任务，其他任务等待；
- 早期用依赖和等待解决冲突，冲突增多后再使用分支或独立工作树。

## 完成条件

工作流完成必须提供实现、测试/验收证据、影响文档和未决项。计划完成后更新当前架构，稳定约束变化时修订 `FACTS.md`。
