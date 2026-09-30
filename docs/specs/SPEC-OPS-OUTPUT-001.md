---
kind: spec
id: SPEC-OPS-OUTPUT-001
status: accepted
owner: infrastructure
last_reviewed: 2026-09-30
---

# Ops 结构化结果与输出协议

## 范围

本 Spec 约束 `apps/blog` 与 `apps/blog-deploy` CLI 的内部结果、输出端口和可观察输出。业务命令内部只传结构化对象；终端文字和 JSON 由输出适配器生成。

## 内部边界

- 命令 handler 返回 `Result<CommandValue, OpsFailure>`，不得返回裸退出码。
- 可预期失败使用 `OpsFailure`；外部 `Error` 只在边界捕获并归一化。
- `OpsFailure.code` 使用稳定 `OpsErrorCode`；退出码使用 `EXIT_OK`、`EXIT_USAGE`、`EXIT_FAILURE`、`EXIT_SIGINT`、`EXIT_SIGTERM` 命名常量。
- `OpsFailure.details` 是结构化诊断载荷；字符串只允许作为外部子进程行或适配器最终渲染结果。

## OutputPort 事件

`OutputPort` 接收封闭事件联合：

- `log`：阶段、进度、警告、错误和子进程行，带 `level/source/channel/message/data`；
- `result`：最终成功、失败或跳过结果，带 `command/code/exitCode`；每个命令最多一个权威终止结果；
- `telemetry`：命令和阶段打点，不默认写入终端或 JSON stdout。
- `lifecycle`：长驻命令的服务就绪和 dry-run 中间状态；运行结束仍须有唯一终止结果。

命令不得直接调用 `console.*`。终端、人类文本、NDJSON 和测试捕获分别由适配器实现。

## JSON 模式

`--json` 输出 NDJSON，每行一个 JSON 对象；stdout 不混入人类横幅、帮助或 spinner。错误诊断进入 stderr 或结构化错误事件。事件至少包含 `schemaVersion`、`event`、`command`、`code`、`exitCode` 和 `message`；runtime 的 `services_ready`、`dry_run`、`terminated` 事件使用同一字段集合。

本协议允许 breaking change。仓库内消费者、测试和指南必须在同一变更中迁移，不维护双写或旧格式解析。

## 埋点

本阶段只提供可注入 OutputPort、空适配器和测试收集器；不落盘、不联网。后续可增加指标、审计或追踪适配器，不改变命令领域接口。
