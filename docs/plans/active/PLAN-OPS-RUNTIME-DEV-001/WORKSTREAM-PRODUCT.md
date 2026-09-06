---
kind: workstream
id: WORKSTREAM-OPS-RUNTIME-PRODUCT
status: completed
plan_id: PLAN-OPS-RUNTIME-DEV-001
role: product
owner: product
depends_on: []
write_set: [docs/specs/, docs/plans/active/PLAN-OPS-RUNTIME-DEV-001/PLAN.md]
last_reviewed: 2026-09-05
---

# 运行模式与命令契约

## 目标

将三种运行模式、`ops delivery build`、命令参数、默认端口、日志语义和失败行为定义成可验收契约，并固定 Rust 服务边界（Product / Data / Mock）。

## 输出

- `runtime dev`、`runtime backend [--data mock|test]`、`runtime integration [--watch]` 与 `delivery build` 的用法和示例；`ops runtime serve` 删除，不保留别名；
- 模式、服务、端口（Vite `5173`、Product `8080`、Data `8081`、Mock `9090`）和环境变量矩阵；
- 启动、退出（`0`/`10`/`20`/`130`）、端口冲突和构建失败的 `SPEC-*` 场景。

## 验收

- 新开发者只看帮助即可选择正确模式；
- 每种模式都能说明启动哪些服务、是否连接真实后端和最终访问地址；
- 未决参数不被提前伪装成已确定契约。

## 交付记录

- 2026-09-06：产出 `docs/specs/SPEC-OPS-RUNTIME-001.md`（status `draft`，待 PM/用户评审后转 accepted）。覆盖：四条命令的参数/默认值/示例与 `serve` 删除迁移提示；模式 × 服务 × 端口矩阵（Vite 5173 / Product 8080 / Data 8081 / Mock 9090）与有界递增、实际绑定注入语义；`BLOG_API_ORIGIN` 注入与 `--scenario` 仅 CLI（默认 `default`）；进程/失败/退出码 `0`/`10`/`20`/`130`、`--json` 错误结构与日志前缀。共 35 条场景（Acceptance 26、Build 7、Spike 2），每条标注强度。未改 `PLAN.md`（虽在 write set 内，按任务约束保留给 PM）。
- 本 workstream 在 Spec 中固定而 PLAN 未明说、需 PM 确认的推导：`integration` 固定 `data=test` 且不提供 `--data`；本期不提供 `--host`/`--listen`（监听固定 `127.0.0.1`）；端口覆盖参数命名 `--web-port`/`--product-port`/`--data-port`/`--mock-port`，取值 `1024`–`65535` 且不支持 `0`。
- 未决问题（已写入 Spec「待决策」表，OPEN-1…OPEN-10）：① 用法错误顶层码 `10`（PLAN）与 `2`（SPEC-OPS-USABILITY-004 已 accepted，`help.ts` `leafExitCodes` 自动补 `2`）冲突；② 递增上限数值；③ `data=test` 临时 SQLite 位置/命名/清理；④ 子进程注入标识符命名与形态；⑤ test 库运行后删除与并发隔离；⑥ ops 自身收 SIGTERM 的退出码（PLAN 只定义 SIGINT=130）；⑦ 是否给 `integration` 加 `--data mock`；⑧ `serve` 删除后 `AGENTS.md`、`docs/guides/operations.md` 手工双终端路径的文档去留；⑨ `--json` 是否提供正常启动的结构化地址清单；⑩ SIGTERM 关停限期精确值与超限处理。
- PLAN 内部矛盾/缺口：①上述退出码 `10` vs `2`，以及既有叶子命令（`delivery build`、`workspace doctor`、`quality *`、`database migrate`）声明退出码 `1`，PLAN 的"顶层退出码合并"未说明是否覆盖这些非 runtime 命令；② `--scenario` 只允许 CLI，但 PLAN 的 `ops runtime dev` 签名未列任何参数，而 Mock 是仅 `dev` 启动的服务，`--scenario` 的挂载点缺失（Spec 暂定 `dev [--scenario]`）；③ `ops database migrate`（Go 实现、env `BLOG_DATABASE_PATH`）在 PLAN 的模式/构建/Go 退场表述中均未被提及，去留未定义；④ SIGTERM 关停顺序被定义，但 ops 顶层 SIGTERM 退出码缺位；⑤ `integration` 由 Product 挂载 `web/dist`，但页面路由映射现由 Vite dev 中间件实现，未知路径/尾斜杠/深层刷新的静态回退契约缺失（已立 Spike `SPEC-OPS-RUNTIME-001-SPIKE-001`）；⑥ `--watch` 重建窗口内半写 `dist` 的一致性契约缺失（已立 Spike `SPIKE-002`）。
- 2026-09-06（第二轮）：用户与 PM 对 OPEN-1…OPEN-10 全部决策，已落入 `SPEC-OPS-RUNTIME-001.md`：
  - 用户决策：退出码全局统一 `0`/`10`/`20`/`130`/`143`（SIGTERM=143），适用于**所有** ops 命令，既有 `1`/`2` 废止（关闭 OPEN-1/OPEN-6）；`ops database migrate` 删除，迁移由 Data Server 启动自动执行（`sqlx::migrate!()`），Spec「已删除命令」节已补迁移提示（改用 `backend`/`integration`，等待 Data 就绪即迁移完成）。
  - PM 裁定：端口递增每端口最多尝试 10 个（+0…+9，关闭 OPEN-2）；test 库在 `target/test-dbs/`、以 PID 命名，正常退出即删、异常退出保留（关闭 OPEN-3/OPEN-5）；注入标识符沿用 `BLOG_` 前缀、实现期确定，记入 Spec 附录 A（关闭 OPEN-4，留实现期子项）；`integration` 不加 `--data mock`（关闭 OPEN-7）；`--json` 提供正常启动地址清单，新增场景 `CMD-009`（关闭 OPEN-9）；关停限期 5s、超限 SIGKILL（关闭 OPEN-10）；AGENTS.md/operations.md 旧条目清理转为 RUNTIME workstream 依赖项（关闭 OPEN-8，记入 Spec「RUNTIME 工作流依赖项」）。
  - 追认为本轮正式契约：`integration` 固定 `data=test`；监听固定 `127.0.0.1` 且不提供 `--host`/`--listen`；端口参数命名与 `1024`–`65535`（禁 `0`）；`ops runtime dev [--scenario]`。
  - 同步修订 `docs/specs/SPEC-OPS-USABILITY-001.md`（即场景 `SPEC-OPS-USABILITY-004` 所在文件，无独立 004 文件）：`version` 1→2、`last_reviewed` 2026-09-06、新增「约束」全局退出码边界、`SPEC-OPS-USABILITY-004` 退出码 `2`→`10`、新增「修订记录」节。该文件其余场景无 `1`/`2` 断言；`ops/src/interface/help.ts` 的 `leafExitCodes`（自动补 `2`）与既有命令的 `1` 属 RUNTIME 写集待办，已在两份 Spec 标注。
  - 场景数现为 36（Acceptance 28、Build 6、Spike 2）；Spec status 仍为 `draft`，待 PM 验收后转 `accepted`。
