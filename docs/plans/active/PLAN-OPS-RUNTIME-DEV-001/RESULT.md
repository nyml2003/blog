---
kind: plan-result
id: RESULT-OPS-RUNTIME-DEV-001
plan_id: PLAN-OPS-RUNTIME-DEV-001
status: review
last_reviewed: 2026-09-06
---

# PLAN-OPS-RUNTIME-DEV-001 结果记录

## 最终状态

review（待用户验收；六个 workstream 全部 completed，证据如下）

## 交付概览

- `ops runtime` 成为本地服务编排层：`dev`（Vite + Mock）/ `backend [--data mock|test]` / `integration [--watch]` + `ops delivery build`；`serve` 与 `database migrate` 已删除（迁移由 Data Server 启动时自动执行）。
- 后端从 Go 整体迁移到 Rust：仓库根 Cargo workspace（`protocol` / `product` / `data` / `mock`）；Go 代码、模块与工具链已物理移除（2026-09-06 用户确认；`blog.db*` 数据文件保留）。
- 运行时架构：Tokio `current_thread` + axum/hyper + 数据层同步线程池（背压 503 / 协作式取消 / 两段式关停）+ SQLx（Pool + `migrate!`）。该决策由用户于 2026-09-06 作出，取代最初"无 Tokio/无 async-await"约束；纯 std Spike 结论归档于 `WORKSTREAM-BACKEND.md`。
- 行为契约：`SPEC-OPS-RUNTIME-001`（accepted，36 场景：28 Acceptance / 7 Build / 1 Spike）+ `SPEC-OPS-USABILITY-001` v2（退出码全局统一 `0`/`10`/`20`/`130`/`143`，`1`/`2` 废止）。

## 验证证据（2026-09-06 PM 最终复跑）

| 套件 | 结果 |
| --- | --- |
| ops 契约测试（node:test） | 65 pass / 12 门控 skip / 0 fail |
| 真实栈 E2E（`OPS_RUNTIME_E2E=full`，真实子进程+真实端口+真实构建） | 13 pass / 0 fail |
| Rust（`cargo test --workspace`） | 93 pass / 0 fail |
| web（`tsx --test`） | 22 pass / 0 fail |
| `ops quality check`（cargo 三件套 + pnpm 四项 + ops 契约） | exit 0 |

## PLAN 验收标准逐条

| # | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `dev` 只启 Vite+Mock，显式 session 切场景验证跨请求状态 | 通过 | `runtime.stack.test.ts` MODE-001（真实栈：session 创建→发布→隔离、`--scenario empty`）；`mock/tests/http_contract.rs` |
| 2 | `backend` 下 Product 无 SQLite 依赖 | 通过 | product 依赖树 0 sqlx/sqlite + MODE-002 真实栈（`database:null`、无临时库） |
| 3 | `integration` 构建前端并由 Product 挂载 `web/dist`；`--watch` 可更新且可诊断 | 部分（用户接受为已知限制） | MODE-004 真实栈（页面 200 / 真实 asset / `/api` 同源）；`--watch` 链路由编排单测+冒烟支撑，产物更新自动化与 SPIKE-002 原子切换留后续 |
| 4 | 现有路由/envelope 过 Rust Product 契约测试（发布、摘要、推荐、shelf） | 通过 | `product/tests/contract.rs` 逐端点对照已移除的 Go 参考（含三处 PM 豁免差异，见 Spec SPIKE-001 节） |
| 5 | Data mock/test 夹具可复现；test 每次新临时库+自动迁移+稳定 seed | 通过 | `store_semantics.rs` + MODE-003 真实栈（两轮不同 PID、同 seed、正常退出删库） |
| 6 | N+1 指标：调用量不随条目数线性增长 | 通过 | pageSize 1/3/9 → `data_calls=1`、`data_queries=3`（真实栈 + `chain.rs`；correlation/item_count/call count 记录格式见 WORKSTREAM-TESTING §3） |
| 7 | `delivery build` 只构建前端与 Rust binary；Go 退出质量门禁 | 通过 | 真实构建断言无 Go 步骤/产物；Go 文件、`go.mod`、flake 工具链已物理移除 |
| 8 | 端口冲突、启动失败、构建失败、子进程退出、Ctrl-C 返回既定退出码并清理 | 通过（失败注入分支为编排单测级） | FAIL-003/005/006/009 真实栈；FAIL-004/007 编排单测；`0/10/20/130/143` 全覆盖、无遗留进程断言 |
| 9 | 通道背压（满则 503）、协作式取消、关停顺序可复现 | 通过 | `chain.rs` 跨进程 503 envelope；`http_server.rs` 取消与关停顺序；`residency.rs` 常驻回归 |

## 生效变化

- Specs：新增 `SPEC-OPS-RUNTIME-001`（accepted）；`SPEC-OPS-USABILITY-001` 升 v2（退出码全局统一，含修订记录）。
- Architecture：`backend.md`（Rust 重写）、`infrastructure.md`（新命令面与端口/退出码契约）、`frontend.md`（integration 托管 + Client 注入与拦截器节）。
- Guides：`operations.md`（三模式 + 已删除命令迁移）、`testing.md`（Rust 三件套 + E2E 门控说明）。
- `AGENTS.md`：技术栈（Rust + SQLite）、命令清单、退出码、Go 退场记录。
- 代码：`crates/`（protocol/product/data/mock，共享投影与 sceneCode 上移 protocol）、`ops/src/`（编排层：进程原语、端口管理、错误/`--json`、退出码统一）、`web/common/`（Transport 拦截器 + mock-session 注入层）；删除全部 Go 代码、`blog-server` 二进制、`serve`/`database migrate` 命令。

## 未决项（后续计划候选）

1. `--watch` 产物更新自动化 + SPIKE-002 重建窗口原子切换（本期已知限制，用户 2026-09-06 接受）。
2. 公网 HTTPS 网关 + B 端认证 + 写接口保护（另立 plan；`operations.md` 红线：公网前必须补认证）。
3. Data `prod` 语义；`wire` 的 `Deserialize` derive（待需要时）；夹具收敛到 `protocol::fixture`（超本计划授权）。
4. `/mock/diagnostics` 经 Vite 代理（可选增强）。
5. 环境事实：WSL2 下 `127.0.0.1:8080` 常被 Windows 侧占用且 `ss` 不可见——默认候选几乎必递增，固定端口用 `--product-port`。

## 关键决策记录

- 2026-09-05 用户：以 PLAN.md（Rust 方案）为基准执行；当日授权"仅启动阶段"后逐步放开至全程。
- 2026-09-06 用户：HTTP I/O 采用 Tokio `current_thread` + axum/hyper（外部网关方案收编，含 4 条架构修订：去层间通道、去绑核、P50 限定 keep-alive、内存预算放宽）；公网 TLS 部署后置另立 plan。
- 2026-09-06 用户：退出码全局统一；`database migrate` 删除（迁移自动化）；Go 全部物理删除；共享重构执行；`--watch` 缺口接受为已知限制。
- PM 裁定：端口递增上限 10（+0…+9）；test 库 `target/test-dbs/<PID>.db`（正常退删/异常保留）；SIGTERM `143`；`--json` NDJSON 语义（最后一行为终止状态）+ 正常启动地址清单；关停限期 5s + SIGKILL；FAIL-005 补强（长驻服务 exit 0 亦为 `CHILD_EXITED`）；SPIKE-001 转正静态挂载路由契约并豁免三处与 Go 的有意差异。
