---
kind: plan
id: PLAN-OPS-FRAMEWORK-001
status: partial
owner: project-manager
created: 2026-09-27
last_reviewed: 2026-09-27
---

# ops 框架解耦

## 目标

把 ops 的框架能力与具体命令实现物理分层：

- 框架层 `packages/cli-kit/src/`：参数模型与解析、命令注册与路由、帮助与退出码、运行器（runner）、端口契约；
- 命令层 `apps/blog/src/`：workspace / quality / package / runtime / delivery / admin / content / playground / installer，每个命令自包含，只依赖框架层；
- 组合层 `apps/blog/src/`：从同一框架组合出不同入口——仓库全量 CLI 与服务器安装器 bundle；服务器安装器复用框架的参数/解析/帮助/退出码，不再自带一套。

## 成功标准

1. 目录与依赖方向成立：`commands/*` 可依赖 `framework/*` 与 `infrastructure/*`，反向依赖与命令间横向依赖由自动化护栏挡住；
2. 全量 CLI 的命令路径、参数面、帮助文本、退出码语义保持不变；`ops quality check` 全绿；
3. `framework/runner.ts` 只负责通用路由，`entrypoints/cli.ts` 负责全量命令组合；nix 里的 ops wrapper 路径同步更新，`ops help` 全量回归一致；
4. 安装器命令迁入 `apps/blog-deploy/src/installer/`，由 `entrypoints/installer.ts` 组合并 esbuild 打成 `blog-deploy.mjs`；命令必须显式写 `init/deploy/redeploy`，`buildTag` 只从 `blog.json` 读取且当前只能为 `latest`；
5. 裁剪冒烟：installer bundle 不包含 runtime/quality 等命令的实现（产物断言）；
6. CI（script-release/build-release）不受影响；打一次 `script-v*` 验证产物；服务器 `redeploy` 实测通过。

## 非目标

- 不改命令业务语义、输出格式与既有帮助内容（安装器参数面调整除外）；
- 不引入外部运行时依赖、不发 npm 包、不拆仓库；
- 不重写 quality / architecture 规则内容；
- 不承诺内部 import 路径兼容（以命令面契约与测试兜底）。

## 约束与依据

- Spec：`SPEC-OPS-PARAMETERS-001`（字段模型）、`SPEC-OPS-RUNTIME-001`（运行与交付）；框架若触碰公共参数面需显式修订 Spec，否则保持契约不变；
- 仓库内 ops 以 `node --experimental-strip-types` 直跑、无构建；服务器安装器以 esbuild 打成 node18 单文件。框架层必须是纯 ESM + node 内置依赖、无副作用、可裁剪；
- 组合入口按命令集装配，框架不得静态 import 全量 registry；
- 计划目录与模板采用历史 `docs/plans/_template/`。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 框架层抽取 | infra | - | `packages/cli-kit/src/**`（含 runner 泛型化 context）、框架契约测试 | completed |
| 命令模块迁移 | infra | 框架层 | `apps/blog/src/**`、删除旧 `domain`/`application`/`interface` 中的命令文件与 import 更新 | completed |
| 入口与组合 | infra | 命令模块 | `apps/blog/src/{cli,installer}.ts`、`nix/flake.nix` ops wrapper、安装器目标更新与裁剪断言 | completed |
| 安装器复用框架 | infra+deploy | 入口与组合 | `apps/blog-deploy/src/installer/**`（参数层替换、`buildTag: latest` 配置契约）、installer 测试、`deploy/README.md` | completed |
| 文档与验收 | pm | 全部 | Spec 评估/修订、计划目录、质量门禁与本地 bundle 验收 | partial |

## 集成验收

1. 框架契约：参数解析/帮助/退出码/泛型 context 有独立测试；护栏测试挡住反向依赖；
2. 全量回归：`ops quality check` 全绿；关键命令帮助与退出码与改造前逐项比对；
3. 组合：installer bundle 冒烟（init / deploy --dry-run / --help），产物裁剪断言通过；
4. CI：打 `script-v0.1.x` 由新入口产出安装器并挂 Release；
5. 端到端：服务器 `node /etc/blog/blog-deploy.mjs redeploy` 实测通过。

## 实施顺序

1. 框架层抽取（行为不变）→ 跑 ops 测试；
2. 逐命令迁移（每次迁移后全量测试保持绿）；
3. 入口拆分 + nix wrapper 更新 + `ops help` 回归；
4. 安装器接入框架（参数面调整）→ bundle/裁剪/CI 验证；
5. 服务器 redeploy 验收 → 计划收尾（未交付项与证据写入 RESULT）。

## 未决项

- `SPEC-OPS-RUNTIME-001` 是否需随入口/组合契约补充说明（实施第一步评估后决定）；
- 安装器版本策略当前固定为 `blog.json` 中的 `buildTag: latest`；未来支持固定版本时另立决策。
