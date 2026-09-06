---
kind: workstream
id: WORKSTREAM-OPS-USABILITY-TESTING
status: completed
plan_id: PLAN-OPS-USABILITY-001
role: frontend-core
owner: frontend-core
depends_on: [WORKSTREAM-OPS-USABILITY-CLI]
write_set: [ops/src/**/*.test.ts, docs/plans/active/PLAN-OPS-USABILITY-001/]
last_reviewed: 2026-09-05
---

# CLI 契约与回归测试

## 目标

把帮助可发现性和错误引导固定为可回归的 CLI 契约。

## 覆盖范围

- 根帮助包含所有当前叶子命令；
- 分组帮助只包含直接子命令；
- 叶子帮助包含用法、选项、示例和退出码；
- `help` 与 `--help` 等价；
- `<path> help` 与其他帮助入口等价，已知分组直呼返回 `0`；
- 未知命令、未知选项、缺少参数和错误值；
- 现有命令解析和 `--dry-run` 兼容性。
- `direnv exec`、`nix develop`、根目录、嵌套目录和项目外入口一致性。

## 验收

- 测试不依赖终端颜色或不稳定的空白格式；
- 失败输出能指出具体缺失的帮助或命令信息；
- 既有 ops 测试和新增契约测试全部通过。
- 真实 CLI 子进程测试覆盖 stdout、stderr 和退出码；入口测试覆盖绑定项目根和无环境快速失败。
