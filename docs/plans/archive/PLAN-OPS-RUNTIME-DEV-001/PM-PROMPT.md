---
kind: plan-pm-prompt
id: PM-PROMPT-OPS-RUNTIME-DEV-001
plan_id: PLAN-OPS-RUNTIME-DEV-001
status: completed
last_reviewed: 2026-09-05
---

# 项目经理 Agent 启动提示

你是 `PLAN-OPS-RUNTIME-DEV-001` 的项目经理。

请先阅读：

- `PLAN.md`；
- `docs/FACTS.md`；
- `docs/architecture/`；
- `docs/guides/`；
- `ops/src/interface/registry.ts`、`cli.ts`、`application/commands.ts`、`infrastructure/` 及相关测试。

负责把 `ops runtime` 建成本地服务编排层，并协调本期后端从 Go 整体迁移到 Rust：仓库根 Cargo workspace，多个独立 binary（Product API、Data Server、Mock Product API）。运行命令为三种模式加交付构建：前端 + Mock 的 `dev`、纯后端 `backend [--data mock|test]`、集成链路 `integration [--watch]`，以及 `ops delivery build`；`ops runtime serve` 直接删除，不保留兼容别名。

所有模式都必须转发带来源前缀的日志（`[web]`/`[product]`/`[data]`/`[mock]`/`[ops]`）、管理端口（默认候选 Vite 5173、Product 8080、Data 8081、Mock 9090；支持覆盖与有界递增，以实际绑定结果注入依赖）、处理 Ctrl-C 和子进程退出，顶层退出码全局统一为 `0`/`10`/`20`/`130`/`143`（2026-09-06 确认覆盖既有命令，`1`/`2` 废止）。Mock 是独立 Rust HTTP server，用显式 session header（如 `X-Blog-Mock-Session`）隔离跨请求状态；只做项目专用实现，不做通用 Faker 或完整后端模拟。

Rust 运行时：采用 Tokio `current_thread` + axum/hyper（2026-09-06 用户决策，取代此前“无 Tokio/无 async-await”约束；纯 std Spike 已验证可行并归档）。数据层为同步线程池（I/O 8 + CPU 1）+ 有界通道 `try_send` 背压（满则 503）+ `oneshot` 回程；deadline 沿链路传播、取消为协作式、SIGTERM 按「停止 accept → drop 通道句柄 → 限期退出」顺序关停；SQLx 用 `runtime-tokio` + `SqlitePool` + `migrate!`。公网 TLS 部署与 B 端认证另立 plan，本期服务只做本地 http 监听。

先检查代码和工作区状态，将计划置为 `in_progress`，按 产品 -> Rust 后端/Runtime/Mock/前端注入 -> 测试 顺序协调 agent。外部 Product HTTP 契约（路径、方法、`sceneCode`、JSON envelope、领域错误码）保持兼容；Go 仅作参考，最终移除。涉及新增模式语义、端口默认值、命令改名或范围扩大时先向用户确认。
