# Blog

个人长期沉淀型技术知识库博客，用于整理工程经验、复杂问题排查过程与可复用方案。

> 当前处于快速迭代早期。代码结构、接口和文档会持续调整，尚不承诺稳定兼容或生产就绪；文档描述的是各自复核时点的现状，Plan 也允许部分完成后结束。

## 技术组成

- 后端：Rust + SQLite，Cargo workspace 位于 `src/Cargo.toml`；包含共享 core、Product API、Data Server 和 Mock Product API。
- H5 前端：Solid.js + TypeScript + Vite，应用壳位于 `src/frontend/`；Desktop 与 Mobile UI 独立实现，共享无界面协议和逻辑。
- 微信小程序：原生 WXML/WXSS/TypeScript，工程位于 `apps/weapp/`；与 H5 复用同一份 `@blog/mobile-api` 协议客户端与纯逻辑，宿主能力（网络/存储/导航）经 `packages/weapp/mobile-host` 适配。
- 运行与质量入口：项目本地 `ops`，由 `nix/` 中的 Flake 提供开发环境。
- 配套包：`packages/` 中的 `@fluvient-loom/*`、`@fluvient-cli/cli-*` 与 `@blog/*` 包；与博客应用同仓库维护，使用根目录 pnpm workspace 独立开发和验证。

## 五分钟启动

需要已启用 Flake 的 Nix（只提供 Rust 工具链与 `ops` wrapper）；Node 与 pnpm 来自用户环境，推荐用 nvm 管理 Node 24，pnpm 版本见根 `package.json`。推荐同时使用 `direnv`。首次进入仓库：

```sh
cd <仓库路径>            # 本机检出位置，如 ~/monorepo/blog
direnv allow
ops workspace doctor
```

未使用 `direnv` 时，可改为进入开发 Shell：

```sh
nix develop ./nix
```

启动前端开发栈（Vite + Mock Product API）：

```sh
ops runtime dev --scenario default --admin-entry on --web-port 5173 --mock-port 9090
```

终端会打印实际绑定的访问地址；候选端口被占用时，地址可能不是命令中给出的端口。使用 `Ctrl-C` 停止服务。

## 常用工作流

| 目标 | 命令 |
| --- | --- |
| 查看当前命令与参数 | `ops help`、`ops <path> --help` |
| 检查开发依赖 | `ops workspace doctor` |
| 启动前端与 Mock 数据 | `ops runtime dev --scenario default --admin-entry on --web-port 5173 --mock-port 9090` |
| 启动纯后端 API 栈 | `ops runtime backend --data test --content-source fixture --product-port 8080 --data-port 8081` |
| 启动同源集成栈 | `ops runtime integration --content-source fixture --product-port 8080 --data-port 8081` |
| 构建小程序测试包 | `ops weapp build --environment test` |
| 检查小程序工程 | `ops weapp check` |
| 运行全项目质量检查 | `ops quality check` |
| 验证 workspace 包 | `ops package check` |
| 统计代码行数 | `ops stats lines` |
| 构建交付物 | `ops delivery build` |

所有有值参数都应显式提供。运行模式、参数、退出码、小程序构建与发布流程的完整说明见[开发与运维指南](docs/guides/operations.md)；参数契约见 [SPEC-OPS-PARAMETERS-001](docs/specs/SPEC-OPS-PARAMETERS-001.md)。

## 目录地图

```text
src/
  core/            Rust 共享协议与 HTML 校验能力
  backend/         Product、Data 与 Mock 服务
  frontend/        H5 应用壳：bootstrap 入口、页面注册表、构建配置
packages/
  ts/ web/ solid/ weapp/ cli/ build/
                   workspace 包，按类别分目录（类别即边界策略）
                   ts=平台中立、web=浏览器宿主、solid=Web UI、
                   weapp=小程序宿主、cli=ops 框架、build=构建链
  app/             @blog 应用私有包：API、纯逻辑、UI、validation、pages/（页面包）
apps/
  blog/            ops 命令实现（开发、质量与运行）
  blog-deploy/     部署器与安装器
  weapp/           微信小程序工程（原生四页 + 构建脚本）
deploy/            部署配置（nginx、systemd、local）
docs/              事实、架构快照、Spec 与指南
nix/               开发环境与 ops 命令 wrapper
```

需要按功能定位源码时，从 [CODEMAP](docs/CODEMAP.md) 开始；目录内容变化后，以源码和 workspace 配置为准。

## 文档怎么读

| 入口 | 用途 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 跨迭代协作规则、稳定边界与验证原则 |
| [FACTS.md](docs/FACTS.md) | 预期长期成立的项目基线 |
| [architecture/](docs/architecture/README.md) | 最近复核时点的当前架构快照 |
| [specs/](docs/specs/README.md) | 预期行为和公共契约，是否生效取决于状态与最新决策 |
| [guides/](docs/guides/README.md) | 当前开发、测试和运维方法 |
| [plans/](docs/plans/README.md) | 跨职能计划的目标、执行记录与归档；属于可选工作记录，不是永久事实 |

判断当前实现时，以源码、配置、测试和实际运行结果为准；判断目标行为时，以最新明确决策、有效 Spec 和稳定事实为准。发现二者冲突，应明确记录差异，而不是为了文档一致性扩大任务范围。
