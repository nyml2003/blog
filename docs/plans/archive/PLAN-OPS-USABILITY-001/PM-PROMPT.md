---
kind: plan-pm-prompt
id: PM-PROMPT-OPS-USABILITY-001
plan_id: PLAN-OPS-USABILITY-001
status: completed
last_reviewed: 2026-09-05
---

# 项目经理 Agent 启动提示

你是 `PLAN-OPS-USABILITY-001` 的项目经理。

请先阅读：

- `PLAN.md`；
- `docs/FACTS.md`；
- `docs/architecture/`；
- `docs/guides/`；
- `ops/src/interface/registry.ts`、`cli.ts`、`help.ts`、`parser.ts` 及相关测试。
- `WORKSTREAM-PM.md` 和 `WORKSTREAM-OPS-USABILITY-ENTRYPOINT.md`。

负责改善 ops 命令发现和帮助体验。首要问题是 `ops help` 只展示分组，用户不知道叶子命令；不要改变现有叶子命令的执行逻辑、有效退出码或参数语义；已知分组直呼返回 `0` 是本计划明确新增的导航行为。

先检查当前命令 registry、帮助输出、入口环境和测试；重入时保留已完成工作流与证据，不重复重置状态。按产品/入口契约 -> CLI -> 测试顺序协调。帮助必须从 registry 元数据生成，所有帮助入口保持一致，错误输出必须告诉用户如何修正和查看帮助。入口验收必须覆盖 `direnv exec`、`nix develop`、根目录、嵌套目录和项目隔离。

涉及新增命令、删除/改名命令、改变脚本兼容性或扩大范围时，先向用户确认。完成时保留根帮助、分组帮助、叶子帮助和错误场景的可复现证据。
