---
kind: guide
id: GUIDE-OPERATIONS
status: current
owner: operations
last_reviewed: 2026-09-06
---

# 开发与运维指南

优先使用项目本地 Flake 和 `ops`，不依赖机器上的同名全局命令。

进入项目目录后，`direnv` 会注入绑定当前项目根的 `ops`。同一项目从根目录、子目录或重新加载的环境调用时，命令 registry 保持一致；未激活项目环境时不得回退到其他仓库的同名命令。

常用入口：

```text
nix develop
ops workspace doctor
ops quality check
ops delivery build
ops runtime dev
ops runtime backend
ops runtime integration
```

帮助入口等价：`ops help <path>`、`ops <path> --help` 和 `ops <path> help`。直接运行已知分组（例如 `ops quality`）会展示该分组帮助。

## 运行模式

| 命令 | 进程 | 数据来源 | 页面入口 |
| --- | --- | --- | --- |
| `ops runtime dev [--scenario <NAME>]` | Vite dev + Mock Product API | Mock（`default`/`empty`/`slow`/`server-error`/`malformed-response`） | Vite 地址（默认 `http://127.0.0.1:5173`） |
| `ops runtime backend [--data mock\|test]` | Rust Product API-only + Rust Data | `mock`（内存夹具，默认）或 `test`（临时 SQLite + 自动迁移 + seed） | 无，API 基址即 Product 地址 |
| `ops runtime integration [--watch]` | 先构建 `src/frontend/dist`，再启动 Rust Product（挂载 `src/frontend/dist`）+ Rust Data(test) | `test`（固定，不接受 `--data`） | Product 地址，页面与 `/api` 同源 |
| `ops delivery build` | 无（只构建 `src/frontend/dist` 与 Rust Product/Data/Mock binary，不编译 Go 目标） | — | — |

约定：

- 端口候选为 Vite `5173`、Product `8080`、Data `8081`、Mock `9090`，可用 `--web-port`/`--product-port`/`--data-port`/`--mock-port`（`1024`–`65535`）覆盖；被占用时从候选值起逐次 +1（最多尝试 10 个端口），实际绑定结果即注入给依赖方的地址。
- 监听地址固定 `127.0.0.1`，不提供 `--host`/`--listen`；`--scenario` 只接受命名场景，通过 CLI 传入，不读取环境变量。
- 日志每行带来源前缀 `[web]`/`[product]`/`[data]`/`[mock]`/`[ops]`；`[ops]` 的错误与失败摘要输出到 stderr。
- 顶层退出码全局统一：`0` 成功、`10` 用法/配置错误、`20` 执行失败（端口耗尽、服务启动失败、构建失败或子进程退出）、`130` SIGINT、`143` SIGTERM。运行中的模式没有 `0` 退出路径：正常停止只能通过信号（130/143）；任一服务子进程在运行态自行退出——含 `exit 0`——都算 `CHILD_EXITED`/`20` 并停止其余服务。Ctrl-C 会传播到所有子进程并等待退出（限期 5s，超限 SIGKILL）。
- `--dry-run` 只打印将启动的进程、候选端口与构建步骤，无副作用；`--json` 在 stdout 只输出一个 JSON 对象（错误结构或已就绪服务的地址清单），其余日志转移到 stderr。

## 已删除命令

`ops runtime serve` 与 `ops database migrate` 已删除，不保留兼容别名：

- 原 `serve`（构建前端后由单一服务提供页面、静态资源和 API）改用 `ops runtime integration`：同样是"先构建 `src/frontend/dist`、后端挂载、不启动 Vite"，但后端是 Rust Product + Rust Data(test) 两个进程，且不再提供 `--listen`。
- 独立迁移命令不再存在：迁移由 Data Server 启动时自动执行（`sqlx::migrate!()`）。需要"只迁移"时，用 `ops runtime backend` 或 `ops runtime integration` 启动栈并等待 Data 就绪。

开发环境和生产运行都应考虑 [FACT-RUNTIME-001](../FACTS.md) 的 2 核、2G、40G 约束。公网部署前必须补 B 端认证和写接口保护。
