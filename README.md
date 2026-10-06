# Blog

个人长期沉淀型技术知识库博客，用于整理工程经验、复杂问题排查过程与可复用方案。

> 当前处于快速迭代早期。代码结构、接口和文档会持续调整，尚不承诺稳定兼容或生产就绪；文档描述的是各自复核时点的现状，Plan 也允许部分完成后结束。

## 技术组成

- 后端：Rust + SQLite，Cargo workspace 位于 `src/Cargo.toml`；包含共享 core、Product API、Data Server 和 Mock Product API。
- 前端：Solid.js + TypeScript + Vite，位于 `src/frontend/`；Desktop 与 Mobile UI 独立实现，共享无界面协议和逻辑。
- 运行与质量入口：项目本地 `ops`，由 `nix/` 中的 Flake 提供开发环境。
- 配套包：`packages/` 中的 `@fluvient-loom/*`（前端能力）与 `@fluvient-cli/cli-*`（ops CLI 框架）包；它们与博客应用同仓库维护，使用根目录 pnpm workspace 独立开发和验证。

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
| 运行全项目质量检查 | `ops quality check` |
| 验证 `@fluvient-loom` 包 | `ops package check` |
| 统计代码行数 | `ops stats lines` |
| 构建交付物 | `ops delivery build` |

所有有值参数都应显式提供。运行模式、参数、退出码和管理命令的完整说明见[开发与运维指南](docs/guides/operations.md)；参数契约见 [SPEC-OPS-PARAMETERS-001](docs/specs/SPEC-OPS-PARAMETERS-001.md)。

## 目录地图

```text
src/
  core/            Rust 共享协议与 HTML 校验能力
  backend/         Product、Data 与 Mock 服务
  frontend/        Solid.js 应用、Desktop/Mobile UI 与构建入口
packages/          @fluvient-loom 平台中立与宿主适配包
apps/blog/         ops 命令实现（开发、质量与运行）
apps/blog-deploy/  部署器与安装器
deploy/            部署配置（nginx、systemd）
docs/              事实、架构快照、Spec 与指南
nix/               ops 命令入口与可复现开发环境
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

当前没有固定的计划目录或模板。后续计划需要时再按工作规模建立，不影响现有 Spec、架构和指南独立生效。

判断当前实现时，以源码、配置、测试和实际运行结果为准；判断目标行为时，以最新明确决策、有效 Spec 和稳定事实为准。发现二者冲突，应明确记录差异，而不是为了文档一致性扩大任务范围。
