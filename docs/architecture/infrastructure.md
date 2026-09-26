---
kind: architecture
id: ARCH-INFRASTRUCTURE
status: current
owner: infrastructure
last_reviewed: 2026-09-26
---

# Infrastructure 架构

## 资源基线

目标服务器资源见 [FACT-RUNTIME-001](../FACTS.md)。方案优先保持单机和低运行时依赖。

## 开发环境

- Nix Flake 提供 Node.js 24、pnpm、Rust（rustc/cargo/rustfmt/clippy）、匹配 Rust binding 版本的 `wasm-bindgen-cli`、LLD 和 SQLite CLI；
- `ops` 是项目本地开发与质量入口；
- 前端使用 pnpm 安装、类型检查、构建和格式检查；
- 后端使用 Cargo workspace（`src/core` 与 `src/backend`，workspace 根在 `src/Cargo.toml`）测试和构建。
- 前端 `dev`/`build` 先编译 `article-html-wasm` 的 `wasm32-unknown-unknown` release 产物，再通过 wasm-bindgen 生成 `src/frontend/common/validation/generated/`。生成文件不手工修改、不纳入 git 跟踪、不纳入手写 TS 格式检查；Rust crate 与 Flake CLI 版本必须同步。

## 运行与交付

- `ops runtime dev --scenario <NAME> --web-port <PORT> --mock-port <PORT>`：Vite + Mock Product API，页面数据只来自 Mock（Vite 代理目标由 ops 注入 `BLOG_API_ORIGIN`）；
- `ops runtime backend --content-source <fixture|github> --data <mock|test> --product-port <PORT> --data-port <PORT>`：Rust Product + Rust Data，无页面入口；
- `ops runtime integration --content-source <fixture|github> --product-port <PORT> --data-port <PORT> [--watch]`：先构建 `src/frontend/dist`，由 Product 同源挂载页面与 `/api`；
- `ops delivery build`：构建 `src/frontend/dist` 与 Product/Data/Mock 三个 Rust binary；
- 数据库迁移由 Data Server 启动时自动执行（`sqlx::migrate!()`），无独立迁移命令；
- 参数采用声明式 int32 / enum / switch 内置模型；有值参数无默认值，端口候选必须显式提供；冲突时自候选值起有界递增（+0…+9），以实际绑定结果注入依赖；监听固定 `127.0.0.1`；
- 顶层退出码全局统一：`0` 成功、`10` 用法/配置错误、`20` 执行失败、`130` SIGINT、`143` SIGTERM；
- 仓库零状态：运行时数据一律在仓库外。prod 数据库位于服务器 `/var/lib/blog/blog.db`（FHS 可变数据位，systemd unit 以 `--data-database-path` 显式传入）；公网部署所需的 unit 模板、密钥和发布流程不属于当前开发交付范围。内容以 GitHub 内容仓库为真源（[CONTRACT](../content-repo/CONTRACT.md)），SQLite 是可重建的运行缓存：不做定期备份，恢复方式为清空数据库后从 `main` 同步重建；推荐位与下架墓碑不在内容仓库，数据库丢失即丢失（2026-09-26 决策）；
- 运维操作应记录资源、备份和失败恢复边界。
