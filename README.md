# Blog

个人长期沉淀型技术知识库博客：skill 经验、复杂问题排查与可复用方案。

- **后端** Rust + SQLite（`src/core` 共享基建、`src/backend` 业务服务：Product API / Data Server / Mock Product API），**前端** Solid.js + TypeScript + Vite（`src/frontend`）。
- 命令参数遵循 [显式参数与 switch 契约](docs/specs/SPEC-OPS-PARAMETERS-001.md)，运行命令必须给出场景/数据模式及对应端口，完整示例见 [操作指南](docs/guides/operations.md)。
- **`ops` 是开发与质量入口**：`ops runtime dev`（Vite + Mock 前端栈）、`ops runtime backend`（纯后端）、`ops runtime integration`（构建 + 同源挂载）、`ops quality check`、`ops admin credentials init`（管理端凭证）、`ops content repository init`（内容仓库初始化）。
- 开发环境由 Nix flake 提供（`nix/`），`direnv allow` 后自动加载；顶层退出码 `0`/`10`/`20`/`130`/`143`。
- 工作约定见 [AGENTS.md](AGENTS.md)；文档地图与分层见 [docs/README.md](docs/README.md)。
