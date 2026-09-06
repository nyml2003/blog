---
kind: plan
id: PLAN-OPS-USABILITY-001
status: completed
owner: project-manager
created: 2026-09-05
last_reviewed: 2026-09-05
---

# Ops 命令易用性

## 目标

让项目开发者能够从 `ops` 根命令直接发现可用的叶子命令、理解命令用途、获得下一步提示，并在输入错误时快速纠正。首期改善命令发现和帮助体验，不改变现有检查、构建、服务和迁移的业务行为。

## 成功标准

- `ops help` 直接展示完整的可执行叶子命令清单，而不要求用户先猜分组或阅读源码；
- `ops help <path>`、`ops <path> --help` 和 `ops <path> help` 对同一已知路径展示完全一致的帮助；
- 直接执行已知分组命令时展示该分组帮助并返回 `0`；未知命令、未知选项或参数错误时返回 `2` 并给出最近帮助入口；
- 帮助文本能区分“命令分组”和“可执行命令”，并说明常用工作流顺序；
- 每个叶子命令至少有一句用途说明和一个可复制示例；
- 同一项目、同一工作区状态下，从根目录、任意子目录、重新加载的 `direnv` 和 `nix develop` 进入后，`ops` 都绑定到同一项目 registry；未激活项目环境时不得串用其他项目的 `ops`；
- 现有叶子命令路径、参数语义、有效执行退出码和 `--dry-run` 行为继续兼容；已知分组直呼返回 `0` 是本计划明确新增的导航行为；
- `ops runtime serve` 启动前构建 `web/dist`，由 Go 服务直接托管前端页面和静态资源，不启动前端开发服务器；
- 帮助、解析和错误行为有自动化契约测试；
- 不需要记忆隐藏命令或查看 `ops/src/interface/registry.ts` 才能使用 ops。

## 非目标

- 不在本计划中新增业务命令或改变已有命令的执行逻辑；
- 不重做质量检查、构建、运行服务或数据库迁移实现；
- 不把帮助系统变成复杂的 CLI 框架；
- 不要求用户学习 shell completion 才能发现命令；
- 不删除现有命令别名或破坏脚本调用，兼容性变化需另行确认。

## 约束与依据

- 当前 CLI 已使用命令 registry 生成帮助，叶子命令定义位于 `ops/src/interface/registry.ts`；
- 当前实现支持 `ops help`、`ops <path> --help` 和 `--dry-run`，但根帮助只显示一级分组；
- 帮助应从 registry 元数据生成，避免维护第二份命令清单；
- 项目级 `ops` 由 Nix/direnv 注入，入口必须绑定激活项目根，不能在每次调用时仅依据 `$PWD` 选择项目；
- 目标用户是项目开发者，默认场景是刚进入仓库后不知道下一步使用什么命令；
- 规范、测试和实现都应保持纯 TypeScript 代码可读性要求。

## 已确认方向

- 根帮助默认列出所有叶子命令，按分组组织，并保留分组说明；
- 分组帮助只列出该分组的直接子命令，同时给出继续查看叶子帮助的示例；
- 叶子帮助展示用法、描述、选项、环境变量、示例和退出码；
- 错误输出使用“发生了什么 + 如何修正 + 查看哪条帮助”的结构；
- 对未知命令提供候选命令或分组帮助；
- 对缺少叶子命令的分组调用给出该分组的可执行命令列表；
- 常用路径在根帮助中按固定顺序分组：检查、质量、开发运行、交付、数据库；展示顺序不代表执行依赖；
- 根帮助、分组帮助和叶子帮助使用同一 registry；分组说明、顺序和工作流提示来自稳定分组元数据；
- `--help`、`help <path>` 和 `<path> help` 不隐藏任一入口，未知选项不得被帮助路径静默吞掉。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 产品：命令发现和帮助信息架构 | product | - | `docs/guides/`, `docs/specs/` | ready |
| 入口：项目环境一致性 | infrastructure | - | `flake.nix`, `.envrc`, `docs/guides/operations.md` | in_progress |
| CLI：帮助、错误和命令解析体验 | frontend-core | 产品、入口 | `ops/src/interface/`, `ops/src/domain/` | in_progress |
| 测试：CLI 契约和回归覆盖 | frontend-core | CLI、入口 | `ops/src/**/*.test.ts`, `docs/plans/active/PLAN-OPS-USABILITY-001/` | in_progress |
| 项目管理：协调与集成验收 | project-manager | 全部工作流 | 本计划目录、结果文档和归档目录 | completed |

项目经理启动提示见同目录的 `PM-PROMPT.md`。

## 集成验收

1. 用 `direnv exec <project>` 和 `nix develop <project> -c ...` 在根目录、嵌套目录和其他当前目录分别验证 `ops` 的项目绑定；项目外未激活环境明确失败且不死循环。
2. 在干净终端中运行 `ops`、`ops help` 和 `ops --help`，无需猜测即可找到所有叶子命令，且固定输出顺序一致。
3. 逐级验证 `ops help quality`、`ops quality --help`、`ops quality help`、`ops quality check --help` 等帮助路径及等价性。
4. 验证未知命令、分组直呼、缺少参数、未知选项和错误值的引导信息、输出通道和退出码。
5. 验证现有叶子命令实际执行路径、参数优先级、退出码和 `--dry-run` 行为未改变。
6. 运行 ops 自身的类型/语法、单元、真实 CLI 子进程和入口契约测试。

## 未决项

- 是否支持 shell completion，暂不作为本计划成功标准；
- 是否提供 `ops doctor` 等短别名，需证明能降低记忆成本后再决定。
