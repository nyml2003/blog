---
kind: architecture
id: ARCH-INFRASTRUCTURE
status: current
owner: infrastructure
last_reviewed: 2026-09-06
---

# Infrastructure 架构

## 资源基线

目标服务器资源见 [FACT-RUNTIME-001](../FACTS.md)。方案优先保持单机和低运行时依赖。

## 开发环境

- Nix Flake 提供 Node.js 24、pnpm、Rust（rustc/cargo/rustfmt/clippy）和 SQLite CLI；
- `ops` 是项目本地开发与质量入口；
- 前端使用 pnpm 安装、类型检查、构建和格式检查；
- 后端使用 Cargo workspace（`crates/`）测试和构建。

## 运行与交付

- `ops runtime dev`：Vite + Mock Product API，页面数据只来自 Mock（Vite 代理目标由 ops 注入 `BLOG_API_ORIGIN`）；
- `ops runtime backend [--data mock|test]`：Rust Product + Rust Data，无页面入口；
- `ops runtime integration [--watch]`：先构建 `web/dist`，由 Product 同源挂载页面与 `/api`；
- `ops delivery build`：构建 `web/dist` 与 Product/Data/Mock 三个 Rust binary；
- 数据库迁移由 Data Server 启动时自动执行（`sqlx::migrate!()`），无独立迁移命令；
- 端口默认候选 Vite `5173`、Product `8080`、Data `8081`、Mock `9090`；冲突时自候选值起有界递增（+0…+9），以实际绑定结果注入依赖；监听固定 `127.0.0.1`；
- 顶层退出码全局统一：`0` 成功、`10` 用法/配置错误、`20` 执行失败、`130` SIGINT、`143` SIGTERM；
- 运维操作应记录资源、备份和失败恢复边界。
