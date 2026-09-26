---
kind: spec
id: SPEC-OPS-USABILITY-001
status: archived
version: 2
owner: project-manager
last_reviewed: 2026-09-10
---

# Ops 命令发现与项目入口一致性

## 约束

- 参数声明、switch 存在性、有值参数必填及完整枚举帮助遵循 [SPEC-OPS-PARAMETERS-001](../SPEC-OPS-PARAMETERS-001.md)；本次不改变路由、帮助别名和项目绑定。
- 同一 checkout 和同一环境状态下，`ops` 的项目身份、registry 和帮助输出由激活项目决定，不由调用时 `$PWD` 或调用历史决定。
- 未激活项目环境时不得串用其他仓库的 `ops`；项目入口失败必须快速、明确且不死循环。
- 顶层退出码全局统一为 `0` 成功、`10` 用法/配置错误、`20` 执行失败、`130` SIGINT、`143` SIGTERM，适用于**所有** ops 命令；既有的用法错误码 `2` 与执行失败码 `1` 语义废止（2026-09-06 用户决策，见 `SPEC-OPS-RUNTIME-001` 决策记录 OPEN-1）。

### SPEC-OPS-USABILITY-001

Given the project environment is active
When the developer invokes `ops`, `ops help`, or `ops --help`
Then the same root help is returned with stable group and leaf ordering.

### SPEC-OPS-USABILITY-002

Given a known group or leaf path
When the developer invokes `ops help <path>`, `ops <path> --help`, or `ops <path> help`
Then the same help content is returned with exit code `0`.

### SPEC-OPS-USABILITY-003

Given a known group path
When the developer invokes `ops <group>`
Then the group help is returned with exit code `0` and no command side effect is executed.

### SPEC-OPS-USABILITY-004

Given an unknown command, option, missing argument, or invalid value
When the developer invokes `ops ...`
Then stderr explains what happened and how to correct it, stdout shows the nearest relevant help, and the exit code is `10` (usage/configuration error; the former code `2` was retired by the 2026-09-06 global exit-code decision).

### SPEC-OPS-USABILITY-005

Given the same project environment is entered through `direnv exec`, `nix develop`, the project root, or a nested directory
When the developer invokes `ops help`
Then the CLI path resolves to that project and never to a sibling repository's registry.

### SPEC-OPS-USABILITY-006

Given the project environment is not active
When the developer invokes a project `ops` wrapper from outside a workspace
Then it exits quickly with an explicit workspace error and does not loop indefinitely.

## 修订记录

- **v2（2026-09-06）**：用法错误退出码 `2` → `10`。修订原因：`PLAN-OPS-RUNTIME-DEV-001` 退出码全局统一决策（`0`/`10`/`20`/`130`/`143` 适用于所有 ops 命令，既有 `1`/`2` 语义废止），见 `SPEC-OPS-RUNTIME-001` 决策记录 OPEN-1。
  - 同步修订项：`SPEC-OPS-USABILITY-004` 的 Then 断言由 `2` 改为 `10`；「约束」节新增全局退出码边界。
  - 对齐检查结果：本文件其余场景无 `1`/`2` 退出码断言（`SPEC-OPS-USABILITY-002`/`003` 断言成功码 `0`，不受影响）。
  - 实现侧待办（归 RUNTIME workstream 写集，非本 Spec 变更）：`ops/src/interface/help.ts` 的 `leafExitCodes` 自动追加 `2` 的行为，以及既有叶子命令声明的退出码 `1`，需随 `PLAN-OPS-RUNTIME-DEV-001` 实施改为 `10`/`20`。
- **v1（2026-09-05）**：初版，定义 ops 命令发现与项目入口一致性；当时用法错误退出码为 `2`。
