# 计划结果

## 计划

- Plan ID：`PLAN-OPS-USABILITY-001`
- 最终状态：`completed`
- 项目经理：`project-manager`

## 结果

本轮已完成 ops 帮助信息架构、错误引导、真实 CLI 调用入口和项目环境绑定。相同项目在根目录、嵌套目录、`direnv exec` 以及 `nix develop` 进入时解析到同一 registry；未激活环境不会回退到其他项目。

计划已完成并归档：`ops quality check` 在本次改动相关检查全部通过，但仓库已有 Web 文件格式问题导致整体质量命令返回 `1`。这些文件不属于本计划 write set，未在本轮自动重排，作为已知后续事项保留。

## 已验证内容

| Spec/验收项 | 证据 | 结果 |
| --- | --- | --- |
| `SPEC-OPS-USABILITY-001` 场景 001-004 | `node --experimental-strip-types --test ops/src/interface/*.test.ts ops/src/domain/*.test.ts ops/src/application/*.test.ts`，13/13 通过 | passed |
| 根帮助和分组/叶子帮助 | `ops/src/interface/help.test.ts`、`ops/src/interface/cli.test.ts`；根帮助列出 7 个叶子命令和示例 | passed |
| 等价帮助入口 | `ops help quality`、`ops quality --help`、`ops quality help`、`ops quality check --help` 契约测试 | passed |
| 错误通道和退出码 | 未知命令、未知选项、解析错误均由 CLI 测试断言 stderr 与返回码 `2` | passed |
| 项目环境一致性 | 根目录/嵌套目录/`direnv exec`/`nix develop` 的帮助输出 SHA256 均为 `cc09b726a4cdd05e7a6e6becced8cbbb89056d756e74f154fdd76bc825c7b5d5` | passed |
| 项目外未激活环境 | 从 `/tmp` 运行未设置 `DIRENV_DIR`、`OPS_WORKSPACE_ROOT` 的入口，返回 `1` 并输出 `ops: could not locate workspace from /tmp`，未出现循环等待 | passed |
| Nix 配置 | `nix flake check --no-build .` | passed |
| 整体质量门禁 | `ops quality check`；ops 测试、语法、类型、lint、build 和边界检查通过，Web 格式检查因既有文件失败 | blocked by pre-existing files |

## 生效变化

- Facts：ops 入口由激活环境的 `DIRENV_DIR` 绑定项目根，并在未激活时快速失败；帮助、解析和错误行为有真实 CLI 契约覆盖。
- Architecture：命令分组元数据与叶子命令 registry 统一生成根帮助、分组帮助和叶子帮助。
- Runtime：`ops runtime serve` 先构建 `web/dist`，再通过 `BLOG_WEB_DIR` 让 Go 服务直接托管页面、静态资源和 API。
- Specs：新增并接受 `SPEC-OPS-USABILITY-001`，明确帮助等价性、错误码、环境一致性和项目外失败行为。

## 未决项与后续计划

- 修复或单独安排仓库现有 Web 格式问题后，可在仓库层面重跑 `ops quality check`。
- shell completion 与 `ops doctor` 等短别名仍按计划保持 deferred。
