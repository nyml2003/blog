---
kind: plan
id: PLAN-OPS-RUNTIME-DEV-001
status: completed
owner: project-manager
created: 2026-09-05
last_reviewed: 2026-09-05
---

# Ops Runtime 与 Rust 后端运行层

## 目标

把 `ops runtime` 建成本地服务编排层，并借本期彻底移除 Go 后端。后端由 Rust Product API、Rust Data Server 和 Rust Mock Product API 组成；前端仍为 Solid/Vite。运行层负责模式选择、端口分配、运行配置注入、子进程日志转发、生命周期清理和统一退出码。

本期不做公网部署、不引入 E2E runner；`integration` 只准备可挂载、可复现的前后端数据链路。

## 已确认决策

### 服务与语言

- 采用仓库根 Cargo workspace，多个独立 binary：Product、Data、Mock Product API；共享 `protocol` crate 表达层间类型，Product 内部网关与业务语义分为独立 crate 以支持并行开发。
- 三类服务全部使用 Rust。Go 代码只作为行为、数据库结构和 HTTP 契约参考，最终从运行、构建、质量门禁和文档当前架构中移除，不做双栈兼容期。
- 外部 Product HTTP 契约保持现有前端可见行为：路径、方法、`sceneCode`、JSON envelope、字段和已确认领域错误码保持兼容。
- Data Server 是独立逻辑角色和独立进程。Product 不访问 SQLite；Data 负责数据表、迁移、分页、批量关联和数据模式，Product 负责公开 API、BFF 和领域语义。
- Data API 使用按领域定义的 typed operations，不提供表 CRUD 或通用查询语言；一次 Data 请求内的本地操作保持原子性，不做跨请求分布式事务。
- 数据层计划支持 `mock`、`test`、`prod` 三种语义；本期运行和验收实现 `mock`、`test`，`prod` 作为后续扩展，不纳入本期公网部署。

### 运行模式

```text
ops runtime dev
  Vite dev + Rust Mock Product API；不启动 Product/Data。

ops runtime backend [--data mock|test]
  Rust Product API-only + Rust Data Server；默认 data=mock，不挂载前端。

ops runtime integration [--watch]
  前端构建（或 build --watch）+ Rust Product + Rust Data(test)；
  Product 当前临时挂载 web/dist，供集成链路访问。

ops delivery build
  构建 web/dist 和 Rust Product/Data/Mock 交付 binary。
```

- `ops runtime serve` 直接删除，不保留兼容别名；`ops database migrate` 一并删除，迁移由 Data Server 启动时自动执行（`sqlx::migrate!()`）。`integration` 固定 `data=test`，不提供 `--data`；test 库位于 `target/test-dbs/`、以 PID 命名，正常退出即删，异常退出保留供诊断。
- `integration` 不是浏览器自动化；E2E runner 不在本期范围。
- 默认端口候选为 Vite `5173`、Product `8080`、Data `8081`、Mock Product API `9090`；支持参数覆盖（`--web-port`/`--product-port`/`--data-port`/`--mock-port`，取值 1024–65535，不支持 `0`）和有界递增分配（每端口自候选值起最多尝试 10 个，耗尽返回 `PORT_EXHAUSTED` 并以退出码 `20` 失败），最终以实际绑定结果注入依赖；监听固定 `127.0.0.1`，本期不提供 `--host`/`--listen`。
- `--scenario` 只作为 CLI 场景选择，默认 `default`；不通过环境变量或配置文件切换场景。

### Mock Product API 与前端自测

- Mock 是独立 Rust HTTP server，不是前端进程内拦截器。
- 覆盖现有公共/管理路由及 `sceneCode` 分支；场景是有限命名集合，不做通用 DSL 或完整后端复制。
- Mock 支持跨请求状态：同一显式测试会话可跨页面、刷新和相邻页面流程；每次 runtime 启动/测试运行重新初始化状态。
- 会话通过私有请求头传递显式 session ID（例如 `X-Blog-Mock-Session`）；不使用进程全局状态或隐式 cookie 作为隔离依据。
- 场景至少覆盖正常、空数据、延迟、服务不可用、协议错误，以及带状态的创建/发布/刷新/会话失效边界；响应遵循 Product 外部契约。
- `common/data` 支持创建时注入指定 Client；Client/Transport 支持请求拦截器。Ops 注入运行配置，调试 Client 通过拦截器附加 Mock session header；页面和领域模型不泄漏 Mock 专用类型。

### N+1 边界

- Product 对每个公开请求调用 Data 的次数必须有与结果条目数无关的固定上界；禁止按 item 循环调用 detail。
- Data 的列表读取必须提供当前页面所需的关联数据，使用批量 ID、`IN`/`JOIN` 等方式加载类型和 terms；固定少量并行调用可以接受，逐条调用不接受。
- Data→SQLite 的列表主查询、count、批量关联查询保持固定查询数量；推荐读取同样禁止逐条 `GetArticle`。
- 列表排序保持 `updated_at DESC, id DESC`；cursor 分页、全局缓存和跨请求去重不在本期。
- 验收记录 request correlation、item_count、Product→Data call count 和 Data→SQLite query count，证明调用数不随 item_count 线性增长。

### Rust 运行时与 I/O 架构

- 2026-09-06 决策：放弃此前“不用 Tokio、不用 `async/await`”的约束（纯 std 组合已由 Spike 验证可行、结论归档于 `WORKSTREAM-BACKEND.md`），本期采用 Tokio `current_thread` 单线程运行时承载网关与业务逻辑，axum/hyper 承载 HTTP 语义。
- 数据层为同步线程池：I/O 类 8 线程 + CPU 类 1 线程；业务侧经有界通道 `try_send` 投递任务，通道满立即返回 503（背压是契约的一部分），`oneshot` 回程。
- 线程分工仅为逻辑描述，不做 `core_affinity` 物理绑核；同 runtime 内分层用 crate + trait 边界表达，不引入层间消息通道或 `Envelope` 传递。
- 超时沿链路传播：入口设置绝对 `deadline`，各层以剩余预算计算等待时长，禁止外层超时短于内层的倒挂结构。
- 数据层取消为协作式：worker 以回程通道关闭为取消信号，长循环在批次间隙检查；检测到取消回到 `recv()`，不得退出线程。
- 关停顺序：SIGTERM → 停止 accept → 逐层 drop 通道句柄触发自然退出 → 限期 5s，超限对未退出进程 SIGKILL。
- SQLx 使用 `runtime-tokio` + `SqlitePool` + `sqlx::migrate!()`；统一使用运行期 `sqlx::query` API，不采用 `query!` 编译期宏，控制编译依赖。
- 内存基线：常驻目标 ≤50MB 量级（依据 FACT-RUNTIME-001，以实测为准，不作硬性验收门槛）；P50/P90 性能指标仅在后续公网部署 plan 中定义并验收。

## 进程与错误契约

- 关键服务启动失败、端口耗尽、构建失败或子进程异常退出时停止同一模式的其他进程并清理已启动资源。
- Ctrl-C 传播到所有子进程并等待退出；watch 构建失败停止 watcher 和服务栈，保留诊断输出。
- 日志每行带稳定来源前缀：`[web]`、`[product]`、`[data]`、`[mock]`、`[ops]`。
- Ops 内部使用结构化领域错误；默认人类可读输出，`--json` 输出机器可读错误，并包含正常启动时各服务的实际地址清单。顶层退出码合并为：`0` 成功、`10` 用法/配置错误、`20` 执行失败、`130` SIGINT、`143` SIGTERM；内部保留更细错误码。2026-09-06 确认：该方案全局统一适用于所有 ops 命令（含 `quality`/`workspace`/`delivery`），既有 `1`/`2` 语义废止，`SPEC-OPS-USABILITY-004` 与相关测试同步修订。

## 非目标

- 不保留 Go 后端兼容运行时，不做 Go→Rust 双跑或公共 API v2 迁移。
- 不做公网监听、TLS 终止、证书轮换、systemd/守护进程或生产部署拓扑；公网网关与 B 端认证（含写接口保护，见 `docs/guides/operations.md` 红线）另立 plan，本期架构不排斥后续在网关层引入 rustls。
- 不实现浏览器 E2E runner、完整 Faker、通用 Mock 平台、WebSocket/SSE Mock 或全局缓存。
- 不在本期实现 Data `prod` 运行链路；只保留接口和后续扩展位置。

## 工作流与写集

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 产品：Rust 服务边界、模式和错误契约 | product | - | 本计划、`docs/specs/` | ready |
| Rust 后端：workspace、Product、Data、Mock 与迁移 | backend | 产品契约 | `Cargo.toml`、`crates/`、Rust migrations | ready |
| 前端 Client/Data 注入与 interceptor | frontend-core | Product/Mock 契约 | `web/common/`、必要 composition root | ready |
| Runtime：进程、端口、挂载和配置注入 | frontend-core | 服务 binary 契约 | `ops/src/`、运行文档 | ready |
| 测试与集成验收 | testing | 全部服务 | Rust/TS/ops tests、fixtures | ready |
| 项目管理：迁移、文档和验收 | project-manager | 全部工作流 | `docs/architecture/`、本计划、结果记录 | ready |

## 验收标准

1. `ops runtime dev` 只启动 Vite 与 Mock；可用显式 session 切换命名场景，并验证跨请求状态。
2. `ops runtime backend --data mock|test` 启动 Product API-only 与 Data；Product 无 SQLite 依赖。
3. `ops runtime integration` 先构建前端并由 Product 挂载 `web/dist`；`--watch` 变更可更新构建产物并保持链路可诊断。
4. 所有现有前端路由和 envelope 通过 Rust Product 契约测试；管理发布、摘要校验、推荐和 mobile shelf 行为保持兼容。
5. Data mock/test 夹具可复现；test 每次运行使用新的临时 SQLite，自动迁移并加载稳定 seed。
6. N+1 指标证明 Product/Data/SQLite 调用数量不随列表条目数线性增长。
7. `ops delivery build` 只构建前端和 Rust binary；Go 文件、模块、命令和旧 `serve` 测试不再进入质量门禁。
8. 端口冲突、依赖启动失败、构建失败、子进程异常退出和 Ctrl-C 均返回既定顶层退出码并完成清理。
9. 数据层通道背压（满则 503）、协作式取消与 SIGTERM 关停顺序可通过测试复现。

## 实施前门禁（已完成）

- 2026-09-05 完成 Rust workspace 最小编译 Spike：纯 std（无 Tokio、无 `async/await`、显式 `Future::poll`）组合可行但有代价（executor 干净；HTTP I/O 依赖轮询策略；SQLx 连接级可用但 Pool 不可用）。结论与证据见 `WORKSTREAM-BACKEND.md` 交付记录。
- 2026-09-06 用户决策：本期改用 Tokio `current_thread` + axum/hyper（见「Rust 运行时与 I/O 架构」），Spike 产物归档；公网 TLS 部署与 B 端认证后置另立 plan。
