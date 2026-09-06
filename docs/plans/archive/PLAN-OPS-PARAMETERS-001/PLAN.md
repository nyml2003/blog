---
kind: plan
id: PLAN-OPS-PARAMETERS-001
status: completed
owner: main-agent
last_reviewed: 2026-09-06
---

# Ops 参数机制修正

## 目标

按用户确认的 [参数契约](../../../specs/SPEC-OPS-PARAMETERS-001.md)，保留路由，实施 int32 / enum / switch 内置模型、有值参数显式必填、声明驱动帮助和无默认值执行链路。

## Workstream

- Owner：main-agent，单工作流串行实施。
- 状态：completed。
- 依赖：当前已完成的 Ops Runtime 路由/运行实现及用户确认的参数决策。
- Write set：`ops/src/domain/{commands,parameters,runtime,port-allocation}.ts`，`ops/src/interface/{parser,value-parser,registry,cli,help}.ts`，必要的 `ops/src/application/{runtime,commands}.ts` 调用方及对应测试；当前参数/runtime/usability Spec、开发指南、基础设施说明、README、AGENTS 和本计划记录。
- 不修改：Rust 服务、前端 UI、数据库布局、Flake、浏览器依赖、其他计划写集及历史归档证据。

## 顺序与验收

1. 记录现有 ops quality check 基线。
2. 独立模型解析、声明与帮助；迁移现有命令和完整运行输入。
3. 补齐模型/CLI/执行边界测试，同步当前文档。
4. 通过 ops quality check，验证真实 runtime 进程链路，记录人工 Review、类型检查差异和剩余风险。

## 明确推迟

string / path / 自定义解析 / quality test / 测试编排。本次只为其提供可复用的参数机制，不创建占位命令。

## 执行结果

上述四步已完成，实现与验证记录见 [RESULT.md](./RESULT.md)。2026-09-06 用户确认执行归档流程，计划关闭并移入 archive；已知类型检查基线问题和明确延期项保留在结果记录中，不扩大本计划范围。
