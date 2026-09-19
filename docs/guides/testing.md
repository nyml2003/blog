---
kind: guide
id: GUIDE-TESTING
status: current
owner: quality
last_reviewed: 2026-09-19
---

# 测试指南

## 分层策略

- Rust 领域、存储、API（`src/core` 与 `src/backend`）和 `src/frontend/common`：严格 red-green-refactor；
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

`ops quality check` 负责汇总上述门禁与 ops 契约测试。runtime 全栈端到端测试由 `OPS_RUNTIME_E2E` 环境变量门控（`ops/src/application/runtime.stack.test.ts`）：默认跳过保持快速反馈，`1` 跑进程级，`full` 追加构建级。

## 架构边界门禁

`ops quality check` 还扫描前端 TypeScript/TSX 与 Rust 源码，执行 `SPEC-ARCH-BOUNDARY-001` 的长期边界规则：

- Desktop 与 Mobile 不互相导入 UI；`common` 不依赖平台 UI 或 Solid UI；
- 旧 Desktop/Mobile 页面只从 `solid/queries` 取得业务数据，不直接导入 `common/client`、`common/data` 或 `solid/data`；
- 新 `app/` 运行时遵守 `kernel → infrastructure/habitat → bootstrap` 边界：kernel 不依赖宿主或框架，habitat 通过注入的 API/ports 取数，bootstrap 不反向导入旧页面层；
- UI 组件不直接导入 client/data 或 infrastructure，旧查询层和新 habitat API/resource 都不反向导入页面；
- `common/client` 保持框架无关；
- protocol 不承载货架编排，Product 不直接访问 SQLite，Data 不解析 HTML 或访问 GitHub。

规则的正负样例位于 `ops/src/domain/architecture.test.ts`。违规会让 `ops quality check` 返回 `20`，报告包含文件路径与对应边界说明。
