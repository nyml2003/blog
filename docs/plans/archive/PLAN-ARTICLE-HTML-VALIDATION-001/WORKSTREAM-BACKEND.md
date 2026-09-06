---
kind: workstream
id: WORKSTREAM-ARTICLE-HTML-VALIDATION-BACKEND
status: completed
plan_id: PLAN-ARTICLE-HTML-VALIDATION-001
role: backend-rust
owner: backend
depends_on: [WORKSTREAM-ARTICLE-HTML-VALIDATION-PRODUCT, WORKSTREAM-ARTICLE-HTML-VALIDATION-PARSER, WORKSTREAM-OPS-RUNTIME-BACKEND]
write_set: [crates/product/, crates/mock/, crates/data/, crates/protocol/]
last_reviewed: 2026-09-06
---

# 服务端 Profile 校验与保存/发布边界

## 目标

消费共享 Rust core 输出的 AST，根据已确认的 Profile 实现结构化、稳定、可测试的正文校验，并将其接入未来 Rust 后端的文章创建、更新与发布状态边界。

## 输入

- 已确认的 `SPEC-ARTICLE-HTML-VALIDATION-001.md`；
- `WORKSTREAM-ARTICLE-HTML-VALIDATION-PARSER` 的 AST、source span 与语法错误模型；
- `PLAN-OPS-RUNTIME-DEV-001` 建立的 Rust Product 文章服务、HTTP 路由和文章生命周期；
- 存量审计结果及 Client SDK 协调结果。

## 输出

- 可版本化的 HTML Profile 校验服务；
- 稳定领域诊断和 HTTP 映射；
- 创建、更新、发布的一致处理；
- 不改写原文的行为证明和回归测试。

## 实施任务

1. 将 AST 级 Profile 校验归属到内容领域，避免 handler 与 SQL 层各自复制规则。
2. 设计领域错误和诊断结果，不泄漏 parser 的内部节点或 HTTP 实现。
3. 根据确认策略接入草稿保存、发布和必要的只检查能力。
4. 为历史例外提供只读识别或显式隔离，不进行未经批准的批量写入。

## 测试/验收

- Profile fixture、文章服务测试、HTTP 契约测试和状态转换测试覆盖；
- 直接调用 HTTP、跳过 B 端或修改请求体不能绕过规则；
- 不合规内容不会在公开路径中成为可执行内容。

## 阻塞

- 原 workspace 与 Client capability 依赖已解除，无当前阻塞。

## 交付记录

- 2026-09-06：与正式 Rust Product/Data 边界完成文档协调。HTML 校验属于 Product 领域，Data 只持久化原始正文；具体接入等待其 write set 交接。
- 2026-09-06：正式 Product/Mock 已接入 core，Data 追加草稿状态守卫和原文条件发布。真实 HTTP 与 SQLite/内存双实现的竞态测试通过；公开详情阻断无效历史正文。见 `RESULT.md`。
