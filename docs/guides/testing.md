---
kind: guide
id: GUIDE-TESTING
status: current
owner: quality
last_reviewed: 2026-09-29
---

# 测试指南

## 分层策略

- Rust 领域、存储、API（`src/core` 与 `src/backend`）和 `src/frontend` 平台世界与底层：严格 red-green-refactor；
- Desktop/Mobile UI 早期：使用稳定、可重复的人工验收场景；
- 推荐、预览、发布和公开可见性稳定后，再补浏览器自动化测试。

## 测试优先级

Ops 参数契约测试由现有 `ops quality check` 的 ops 测试发现机制执行，覆盖内置模型、必填值、switch、完整帮助及命令零副作用边界，见 [SPEC-OPS-PARAMETERS-001](../specs/SPEC-OPS-PARAMETERS-001.md)。`quality test` 与新的测试编排入口尚未实现。

先验证可观察行为和跨边界契约，再验证实现细节。每个正式 Spec 至少关联一个自动化测试或人工证据。

## 基础门禁

```text
cargo fmt --all --check --manifest-path src/Cargo.toml
cargo clippy --workspace --all-targets -D warnings --manifest-path src/Cargo.toml
cargo test --workspace --manifest-path src/Cargo.toml
pnpm -C src/frontend run typecheck
pnpm -C src/frontend run lint
pnpm -C src/frontend run format:check
pnpm -C src/frontend run test:core
pnpm -C src/frontend run build
```

`ops quality check` 负责汇总上述门禁与 ops 契约测试。runtime 全栈端到端测试由 `OPS_RUNTIME_E2E` 环境变量门控（`apps/blog/test/commands/runtime.stack.test.ts`）：默认跳过保持快速反馈，`1` 跑进程级，`full` 追加构建级。

浏览器 E2E 由独立的 `ops e2e` 管理，不纳入默认 `ops quality check`。运行时显式传入 `--playwright-module` 和 `--chromium-path`；`ops e2e --mode integration` 验证真实 Product/Data 同源栈，`ops e2e --mode dev --scenario <NAME>` 验证 Vite + Mock 场景。`empty` 场景还覆盖 Mock 管理端登录、进入新建文章和危险 HTML 拒绝。截图、`report.json` 和页面诊断保存在 `target/e2e/<run-id>/`；报告记录最终状态和错误摘要。

## 架构边界门禁

`ops quality check` 对 Cargo manifest 执行 `SPEC-ARCH-BOUNDARY-001` 的依赖禁令：data 不依赖 HTML 解析器与外部 HTTP/GitHub 客户端，product 不直连 SQLite。规则的正负样例位于 `apps/blog/test/commands/architecture.test.ts`，违规会让 `ops quality check` 返回 `20`，报告包含文件路径与对应边界说明。

前端层序、两端 UI 隔离、页面数据访问与 Rust 内容级规则（BFF 决策位置、protocol 职责）是设计意图：源码内容扫描已于 2026-10-04 退役，由评审与包结构承载（跨端硬隔离逐步落到 workspace 包）；kernel 宿主纯度由 `tests/app/kernel/tsconfig.json`（无 DOM lib）编译保证。
