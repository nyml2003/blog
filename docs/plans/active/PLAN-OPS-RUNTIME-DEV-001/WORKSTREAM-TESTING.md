---
kind: workstream
id: WORKSTREAM-OPS-RUNTIME-TESTING
status: completed
plan_id: PLAN-OPS-RUNTIME-DEV-001
role: testing
owner: testing
depends_on: [WORKSTREAM-OPS-RUNTIME-CORE, WORKSTREAM-OPS-RUNTIME-MOCK, WORKSTREAM-OPS-RUNTIME-BACKEND, WORKSTREAM-OPS-RUNTIME-FRONTEND]
write_set: [ops/src/**/*.test.ts, web/ mock tests, crates/ 内 Rust 测试与 fixtures]
last_reviewed: 2026-09-06
---

# Runtime 模式与生命周期测试

## 目标

把运行模式、端口、日志和清理行为固定为可回归契约。

## 覆盖范围

- 三种模式与 `delivery build` 的服务组合；
- 默认端口被占用时的有界递增，实际地址向子进程注入；
- 日志来源前缀和错误转发；
- Ctrl-C、子进程退出、端口耗尽和构建失败，退出码 `0`/`10`/`20`/`130`；
- Mock 场景和固定 seed；
- Rust Product 契约测试：管理发布、摘要校验、推荐和 mobile shelf 兼容；
- N+1 指标：Product→Data call count、Data→SQLite query count 不随 item_count 线性增长；
- Data test 夹具：每次运行新临时 SQLite + 自动迁移 + 稳定 seed。

## 验收

- 测试不依赖真实开发端口或不可控外部服务；
- 进程清理和退出码可复现；
- 既有 ops 契约测试继续通过（`serve`/`database migrate` 相关旧测试随命令删除退出；退出码断言随全局统一迁移 `2`→`10`、`1`→`20`）。

---

## 交付记录（2026-09-06，TESTING 闭环）

### 0. 交付物与修改范围

- 新增 `ops/src/application/runtime.stack.test.ts`：**13 个用例**，全部走真实进程（真实 ops CLI 子进程 + 真实 Rust binary + 真实端口/信号 + 真实前端产物），用 `OPS_RUNTIME_E2E` 门控（见 §1）。
- **未改动任何非测试源码**：`ops/src` 其余文件、`crates/`、`web/`、docs 零改动。Rust 与 web 侧证据全部沿用既有测试（本工作流逐条盘点后确认无缺口，见 §2）。
- 既有 ops 契约测试（74 个）保持全绿；默认套件总量 77（= 既有 74 + 新增 13 中 12 个被门控 skip + 1 个常驻结构断言），**5.5s**，未被拖慢。

### 1. 门控方式与理由

| 层 | 触发方式 | 覆盖内容 | 实测时长 |
| --- | --- | --- | --- |
| 默认 | 不设变量 | 12 个真实栈用例 skip；只跑 1 个常驻结构断言（Product 的 `[dependencies]` 无 `sqlx`/`sqlite`） | 整个 ops 套件 **5.5s** |
| 进程级 | `OPS_RUNTIME_E2E=1` | backend `--data mock`/`test`、dev+Vite、端口递增/耗尽、FAIL-003/005/006/009、N+1 指标 | **~50s** |
| 构建级 | `OPS_RUNTIME_E2E=full` | 额外执行 `runtime integration`（真实 `pnpm build` + 静态挂载）与 `delivery build`（真实 `pnpm build` + `cargo build --release`） | **~63s** |

```bash
OPS_RUNTIME_E2E=full node --experimental-strip-types --test ops/src/application/runtime.stack.test.ts
```

**理由**：这些断言必须用真实子进程/真实端口/真实构建，无法用 double 表达；若不门控，默认 `node --test` 与 `ops quality check`（后者会再次执行 ops 契约测试）都会被拖慢约 60s。同层逻辑已由 `runtime.test.ts` 的 double 用例覆盖，真实栈只在门控层运行一次。

**端口策略（满足"测试不依赖真实开发端口"）**：`PORT_BASE = 23000 + (process.pid % 200) * 20`，在其上寻找**连续空闲窗口**再使用（本机需要 2–11 个连续端口）；完全避开 8080（WSL2 下被 Windows 侧长期占用且 `ss` 不可见）与内核临时端口段 32768–60999。端口占用/耗尽用测试内 `net.Server` 真实占位实现。

**dev 模式的 Vite 环节**：任务书允许以"人工证据"收口，但实测真实拉起 Vite 仅 ~1s（`VITE ready in 220ms`），故改为**直接自动化**（dev 链路 + `--scenario empty` 两条用例），证据强于人工记录。

**清理健壮性**：每个用例 `t.after(dispose)` 兜底收割整棵进程树（ops 已死时其子进程会变孤儿，`pgrep -P` 递归后 SIGKILL）；每个用例结束都断言"端口已释放 + 进程表无该 `--listen` 条目 + `target/test-dbs` 无新增文件"。

### 2. Spec 证据盘点表（SPEC-OPS-RUNTIME-001 全 36 个场景）

> 逐条核对：**28 Acceptance + 7 Build + 1 Spike**（任务书写的"6 个 Build"实际是 7 个：CMD-007、PORT-001、PORT-004、ENV-003、ENV-004、LOG-002、SPIKE-001；SPIKE-002 单列为 Spike）。
> 状态：✅ 通过（自动化）/ 🟡 部分（缺什么见备注）/ 📝 记录（Spike，不作为验收门槛）。

#### 命令面（CMD-001…009）

| 场景 | 强度 | 证据 | 状态 |
| --- | --- | --- | --- |
| CMD-001 帮助可区分三模式 | A | `interface/help.test.ts`「runtime help distinguishes the three modes without reading the plan」；`interface/cli.test.ts` 根帮助分组/清单 | ✅ |
| CMD-002 `dev` 默认场景/端口、只起 mock+web | A | `application/runtime.test.ts`「dev starts mock before vite and injects…」；真实栈用例「PORT-002/PORT-005 + ENV-001 + MODE-001」断言 `services==['mock','web']` | ✅ |
| CMD-003 `backend` mock/test 等价、`prod` 用法错误 | A | `cli.test.ts`「unknown scenario names and invalid data modes are usage errors」（`--data prod`→10）；`runtime.test.ts` backend 计划；真实栈两条（mock / test） | ✅ |
| CMD-004 `integration` 固定 test、拒 `--data`、`--watch` | A | `cli.test.ts`「integration refuses --data and the retired --host/--listen options」；`runtime.test.ts` watch 用例；真实栈 MODE-004 用例（`data`+`product`、test 语义） | ✅ |
| CMD-005 `delivery build` 只构建 web+Rust、无 Go、exit 0 | A | 真实栈「PLAN 验收 7」用例（清空 `target/release/{product,data,mock}` 后真实构建并断言产物/步骤/无 go）；`cli.test.ts` dry-run 无 `go build` | ✅（构建级门控） |
| CMD-006 `serve` 删除且给迁移目标 | A | `cli.test.ts`「deleted commands point at their migration target and exit 10」（serve / database migrate） | ✅ |
| CMD-007 `--dry-run` 无副作用 | B | `runtime.test.ts`「dry run describes the plan and performs no side effect」；`cli.test.ts` 两条 dry-run | ✅ |
| CMD-008 `--json` 失败输出单对象、字段稳定、exitCode 一致 | A | 单测：`runtime.test.ts` 各失败路径 payload（`PORT_EXHAUSTED`/`SERVICE_START_FAILED`/`BUILD_FAILED`/`CHILD_EXITED`）；真实栈：FAIL-003 用例断言 stdout **仅 1 行 JSON** + exit 20、PORT-003 用例断言单对象。**缺口见 §6-1**：启动成功后运行期失败会输出 2 个 JSON 对象 | 🟡 |
| CMD-009 `--json` 正常启动地址清单 | A | `runtime.test.ts` integration `--json` 结构；真实栈：backend/dev/integration 三条都解析真实 stdout（`services`、实际端口、`entry`/`null`） | ✅ |

#### 模式与服务组合（MODE-001…004）

| 场景 | 强度 | 证据 | 状态 |
| --- | --- | --- | --- |
| MODE-001 dev 只连 Mock + 显式 session 跨请求状态 | A | 真实栈 dev 用例：`services==['mock','web']`、无 `[product]`/`[data]` 日志、经 Vite 代理带 `x-blog-mock-session` 创建→发布→该 session `total=10`、匿名 `total=9`；`--scenario empty` 用例（`total=0`）；`crates/mock/tests/http_contract.rs` session 隔离 | ✅ |
| MODE-002 `--data mock` 只两进程、无 SQLite、Product 无依赖 | A | 真实栈 MODE-002 用例（`database:null`、`sqlite disabled` 日志、退出后无临时库）+ 常驻结构断言（product manifest 无 sqlx）+ `crates/data/tests/http_server.rs::mock_semantics_creates_no_sqlite_file` | ✅ |
| MODE-003 test 连续两次：新库/自动迁移/稳定 seed/清理 | A | 真实栈 MODE-003 用例（两轮不同 PID、同 seed、干净退出删库）+ `crates/data/tests/store_semantics.rs::test_semantics_seeds_are_stable_across_runs` + `http_server.rs`（干净退出删库 / SIGKILL 保留） | ✅ |
| MODE-004 `integration` 挂载 `web/dist`、页面与 `/api` 同源；`--watch` 更新产物 | A | 真实栈 MODE-004 用例（页面 200、真实产物 asset 200、`/api` 同源 `total=9`）+ `crates/product/tests/contract.rs` frontendHandler。**`--watch` 变更产物未自动化**（见 §6-3） | 🟡 |

#### 端口（PORT-001…005）

| 场景 | 强度 | 证据 | 状态 |
| --- | --- | --- | --- |
| PORT-001 端口覆盖/越界/非整数/无 `--host` | B | `cli.test.ts`「port overrides are validated as usage errors…」（1023/65536/0/abc→10）+ dry-run 端口覆盖；`cli.test.ts` `--listen` 拒绝 | ✅ |
| PORT-002 候选被占 → 有界递增 + 地址一致 | A | 真实栈 PORT-002/005 用例（真实占位 1 个端口 → Data 落 +1、`候选端口 X, 实际绑定 X+1（递增尝试: …）`、`[data] listening addr=` 与 `/healthz` 实测） | ✅ |
| PORT-003 连续 10 个被占 → 20/`PORT_EXHAUSTED` + 清理 | A | 真实栈 PORT-003 用例（真实占住 10 个连续端口；details 恰为 10 个端口；已启动的 Data 被停止、端口释放、无临时库残留） | ✅ |
| PORT-004 分配顺序 + 同次运行互斥 | B | `domain/port-allocation.test.ts`（窗口 +0…+9、互斥、耗尽清单）+ `runtime.test.ts`「backend allocates data first…」；真实栈中 Product 候选独立、未与 Data 递增结果自撞 | ✅ |
| PORT-005 递增后三地址一致（打印/注入/实际） | A | 真实栈 PORT-002/005 用例（`/product/diagnostics` 的 `dataClient.authority==127.0.0.1:<实际>`）+ dev 用例（页面请求经 Vite 代理真实到达递增后的 Mock 端口） | ✅ |

#### 环境变量与配置注入（ENV-001…004）

| 场景 | 强度 | 证据 | 状态 |
| --- | --- | --- | --- |
| ENV-001 ops 注入覆盖调用者环境 | A | 真实栈 dev 用例（调用者导出 `BLOG_API_ORIGIN=http://127.0.0.1:9999`，页面请求仍到达 Mock，日志无 `9999`）+ `runtime.test.ts` 注入断言 | ✅ |
| ENV-002 场景只走 CLI、不读环境 | A | `cli.test.ts` 未知场景→10；`crates/mock/tests/lifecycle.rs::scenario_is_only_selected_through_the_cli`（`SCENARIO`/`BLOG_SCENARIO` 被忽略）；`runtime.test.ts` `--scenario default` 参数 | ✅ |
| ENV-003 Mock 词汇只在注入层 | B | `web/common/client/mock-session.test.ts` 源码词汇边界扫描（desktop/mobile/common/solid 零 `mock` 命中） | ✅ |
| ENV-004 注入集合恰为附录 A、无隐式默认 | B | `runtime.test.ts`（`--listen`/`--data-semantics`/`BLOG_DATA_ADDR`/`BLOG_WEB_DIR`/`BLOG_DATABASE_PATH` 逐一断言）；真实栈：Data `injected=true`、`/product/diagnostics` 回显 | ✅ |

#### 进程生命周期与失败（FAIL-001…010）

| 场景 | 强度 | 证据 | 状态 |
| --- | --- | --- | --- |
| FAIL-001 就绪后才打印地址 | A | `runtime.test.ts`「addresses are only reported once every service passed its readiness check」；真实栈：`--json` 清单打印后立即 `/healthz`/`/api` 可用 | ✅ |
| FAIL-002 先构建→Data 就绪→Product 就绪 | A | 真实栈 MODE-004 用例（日志偏移：`pnpm … build` < `[data] listening` < `[product] data readiness ok`）+ `runtime.test.ts` integration 顺序 | ✅ |
| FAIL-003 关键服务启动失败 → 20/`SERVICE_START_FAILED` + 清理 | A | 真实栈 FAIL-003 用例（隔离根缺 binary → 真实 exit 20 + stdout 单 JSON + `服务未构建: data`）；`runtime.test.ts`「a service that dies during startup stops the rest…」 | ✅ |
| FAIL-004 前端构建失败 → 不起栈、20/`BUILD_FAILED` | A | `runtime.test.ts`「a failed frontend build never starts the stack and reports BUILD_FAILED」（`spawns.length==0`）。缺真实"损坏前端"复现（§6-4） | 🟡 |
| FAIL-005 运行中子进程退出（含 exit 0）→ 20/`CHILD_EXITED` | A | 真实栈 FAIL-005 用例（SIGKILL Data → exit 20、`details.service=='data'`、`signal=='SIGKILL'`、含最近日志、Product 被停、临时库按契约保留）；`runtime.test.ts` 非零退出用例 + 「exits 0 on its own」用例 | ✅ |
| FAIL-006 Ctrl-C → 传播 + 130 + 无残留 | A | 真实栈：8 次真实运行以 SIGINT 收尾并断言 exit 130 + `assertNoProcessLeftover`；`runtime.test.ts` 信号参数化；`infrastructure/process.test.ts` 组传播/无遗留进程 | ✅ |
| FAIL-007 `--watch` 构建失败 → 停栈、20/`BUILD_FAILED`、诊断保留 | A | `runtime.test.ts`「watch mode starts the rebuild watcher and treats its death as BUILD_FAILED」。缺真实 `--watch` 长跑复现（§6-3） | 🟡 |
| FAIL-008 通道满 → 503 envelope、进程不退 | A | `crates/product/tests/chain.rs`（灌满 io lane → Product 503 `BACKPRESSURE`、两进程存活）+ `crates/data/tests/http_server.rs`（lane rejection 计数）+ `crates/product/src/http.rs` `dataBackpressureTotal` | ✅ |
| FAIL-009 SIGTERM 关停顺序 + 5s + SIGKILL + 143 | A | 真实栈 MODE-003/FAIL-009 用例（exit 143 且 `[data]` 内 `signal received → stop accept → temp db removed → shutdown complete` 顺序）+ `crates/data/tests/http_server.rs`（顺序/限期/删库）+ `crates/product/tests/residency.rs` + `runtime.test.ts` 130/143 参数化 | ✅ |
| FAIL-010 用法错误 → 10（`1`/`2` 废止） | A | `cli.test.ts`（未知命令/选项/缺值/非法取值）、`interface/help.test.ts`「every leaf advertises the unified exit codes, never the retired 1 and 2」 | ✅ |

#### 日志与 Spike

| 场景 | 强度 | 证据 | 状态 |
| --- | --- | --- | --- |
| LOG-001 每行唯一稳定前缀 | A | `domain/runtime.ts::withLogPrefix`（五种来源 + 无尾随空格边界）+ `infrastructure/process.test.ts` 路由断言；真实栈：`assertSingleSourcePrefix` 在 backend 全栈与 `integration` 全栈上断言**零**未带前缀行 | ✅ |
| LOG-002 逐行转发 / stderr 不丢 / 末行无换行 | B | `infrastructure/process.test.ts`（逐行、末行 flush、spawn 失败、stderr 保真、环形缓冲） | ✅ |
| SPIKE-001 静态挂载路由契约（转正） | B | `crates/product/tests/contract.rs`（页面精确映射、无 SPA 回退、404 text/plain、405、`/api/` 未知、穿越）+ 真实栈 MODE-004 用例（`/`、`/m`、`/m/`、`/admin`、`/admin/` 200；`/nope`、`/admin/articles/edit`、`/articles`、`/assets/missing.js`、`/assets/` 404 text/plain；POST `/` 405；穿越 404；`/healthz` 优先） | ✅ |
| SPIKE-002 watch 重建窗口观察 | Spike | `WORKSTREAM-RUNTIME.md` 第三批/第四批记录：原子切换未实现，重建窗口内可能出现半写产物。不作为验收门槛 | 📝 |

### 3. N+1 指标固化（PLAN 验收 6）

**记录格式（固定）**：一次 `ops runtime backend --data test` 真实运行内，对每个 `pageSize` 取样一行；`request_id` 取自 **Data 侧日志**（Product 生成并通过 `x-blog-request-id` 传入，Data 逐请求打印），因此 item_count 与调用数绑定到同一次跨进程调用：

```text
| request | request_id (product→data) | item_count | product→data calls | data→sqlite queries |
```

实测（2026-09-06，`runtime.stack.test.ts` 自动产出）：

| request | request_id (product→data) | item_count | product→data calls | data→sqlite queries |
| --- | --- | --- | --- | --- |
| GET /api/public/articles?pageSize=1 | product-list-1788648638817 | 1 | 1 | 3 |
| GET /api/public/articles?pageSize=3 | product-list-1788648638824 | 3 | 1 | 3 |
| GET /api/public/articles?pageSize=9 | product-list-1788648638829 | 9 | 1 | 3 |

断言链路（每个 `pageSize` 各断言一次）：

1. 响应 envelope `code==OK`，`items.length == min(pageSize, total=9)`；
2. `/product/diagnostics` 的 `dataCallsTotal` 增量 **== 1**（Product→Data 调用数与条目数无关）；
3. `/data/v1/diagnostics` 的 `query_count_total` 增量 **== 3**（count + 当前页 + 批量 terms `IN(...)`）；
4. 本次新增的 Data 日志行匹配 `items=<N> queries=3`，且 Product 日志行匹配 `scene=public.article_list items=<N> total=9 data_calls=1 data_queries=3`。

可用计数器对照：`x-blog-data-query-count` 响应头（Data 直连时）= `/data/v1/diagnostics` 的 `query_count_total` = Product 日志 `data_queries`；`/product/diagnostics` 的 `dataCallsTotal` = Product 日志 `data_calls`。

交叉证据（Rust 侧，既有）：`crates/product/tests/chain.rs`（pageSize 1/5/100 → `data_calls=1 data_queries=3`，查询增量恒 3）；`crates/data/tests/store_semantics.rs::sqlite_store_keeps_query_count_fixed_while_item_count_grows`（1/4/20/100 → `query_count==3`）；`crates/data/tests/http_server.rs`（`x-blog-data-query-count: 3` + `x-blog-data-items: 9`）；`crates/data/tests/write_ops.rs`（写路径语句数：create/update/publish/recommendation 7/shelf 7，均与结果集无关）。

### 4. PLAN 验收标准证据表（计划能否进入验收状态的依据）

| # | PLAN 验收标准 | 证据（测试/命令/记录） | 结论 |
| --- | --- | --- | --- |
| 1 | `ops runtime dev` 只启动 Vite 与 Mock；显式 session 切换场景并验证跨请求状态 | 真实栈：dev 用例（`services==['mock','web']`、无后端日志、session 创建→发布→可见性隔离）+ `dev --scenario empty` 用例（`total=0`、`/mock/diagnostics scenario=empty`）+ `crates/mock/tests/{scenarios,lifecycle,http_contract}.rs`（5 场景、seed 稳定、重启重置、CLI-only）+ MOCK 联动记录（slow 延迟、`server-error`/`malformed-response`） | **通过** |
| 2 | `ops runtime backend --data mock\|test`；Product 无 SQLite 依赖 | 真实栈：MODE-002（mock：`database:null`、无文件）+ N+1/MODE-003 用例（test：`semantics=test`、`applied_migrations` 非空、`seeded=true`）+ 常驻结构断言（product manifest 无 sqlx/sqlite） | **通过** |
| 3 | `ops runtime integration` 先构建前端并由 Product 挂载 `web/dist`；`--watch` 可更新产物且链路可诊断 | 真实栈 MODE-004 用例（真实 `pnpm build` → 页面 200 / asset 200 / `/api` 同源；`webDirMounted==true`）；`--watch` 仅有单测（watcher 进程、BUILD_FAILED）与 RUNTIME 记录，**未自动化"变更→产物更新"** | **部分**（缺 `--watch` 重建产物的自动化证据） |
| 4 | 所有现有前端路由与 envelope 通过 Rust Product 契约测试；管理发布、摘要校验、推荐、mobile shelf 兼容 | `crates/product/tests/contract.rs`（公开/管理全部端点、envelope、camelCase、状态机 409、摘要 422、推荐 6 条、shelf 分组/筛选/空分区、静态挂载）+ `chain.rs` | **通过** |
| 5 | Data mock/test 夹具可复现；test 每次新临时 SQLite + 自动迁移 + 稳定 seed | 真实栈 MODE-003 用例 + `crates/data/tests/store_semantics.rs`（seed 两次运行一致、mock 与 sqlite 行为一致）+ `http_server.rs`（迁移 2、`seeded=true`、干净退出删库/SIGKILL 保留）+ `write_ops.rs` | **通过** |
| 6 | N+1 指标证明调用数不随条目数线性增长 | 真实栈「PLAN 验收 6」用例（§3 表格，pageSize 1/3/9 → calls=1、queries=3）+ Rust 交叉证据（chain.rs / store_semantics.rs / http_server.rs / write_ops.rs） | **通过** |
| 7 | `ops delivery build` 只构建前端与 Rust binary；Go 不再进质量门禁 | 真实栈「PLAN 验收 7」用例（清空产物后真实构建：`[web] $ pnpm … build` → `[ops] $ cargo build --release`、`services==[]`、产物齐全、无 `go build/gofmt/go vet`、无 `target/release/blog-server`）+ `application/check.test.ts`（门禁三件套、Go 门禁消失、workspace 缺失判失败）+ `ops workspace doctor` 只剩 node/pnpm/rustc/cargo | **通过** |
| 8 | 端口冲突、依赖启动失败、构建失败、子进程异常退出、Ctrl-C 均返回既定退出码并完成清理 | 真实栈：PORT-002（递增）、PORT-003（20/`PORT_EXHAUSTED`+清理）、FAIL-003（20/`SERVICE_START_FAILED`）、FAIL-005（20/`CHILD_EXITED`+清理）、8 次真实运行 SIGINT→130 + 无残留；单测：FAIL-004（`BUILD_FAILED` 不起栈）、watch（FAIL-007）；真实栈统一用 `assertNoProcessLeftover`（端口释放 + `pgrep` 进程表 + 临时库） | **通过**（FAIL-004/007 的失败分支为编排单测级，见 §6-4） |
| 9 | 通道背压（满则 503）、协作式取消、SIGTERM 关停顺序可测试复现 | `crates/data/src/store/shared.rs::slow_stops_at_batch_boundary_when_canceled`（批次间隙取消、worker 不退出）+ `crates/data/tests/http_server.rs::endpoints_envelope_backpressure_cancellation_and_shutdown`（503 envelope、诊断计数、关停顺序/限期/删库）+ `crates/product/tests/chain.rs`（跨进程 503）+ `crates/product/tests/residency.rs` + 真实栈 FAIL-009 用例（ops 143 + `[data]` 顺序） | **通过** |

> 任务书提到"八条验收标准"：`PLAN.md` 实际列了 9 条（第 6 条即 N+1），上表按 9 条逐一给证。

### 5. 四套件最终结果（2026-09-06 实测）

| 套件 | 命令 | 结果 |
| --- | --- | --- |
| ops 契约测试 | `node --experimental-strip-types --test 'ops/src/**/*.test.ts'` | **77 tests：65 pass / 12 skip（门控）/ 0 fail**，5.5s |
| ops 质量门禁 | `ops quality check` | **exit 0**（39 项 OK：cargo fmt / clippy -D warnings / cargo test --workspace / ops 逐文件语法 + 契约测试 / pnpm typecheck·lint·format:check·build / web 依赖边界） |
| Rust | `cargo test --workspace` | **90 passed / 0 failed**（data 34、product 7、mock 49） |
| 前端 | `pnpm --filter blog-web run test:core` | **22 pass / 0 fail** |
| （门控）真实栈 | `OPS_RUNTIME_E2E=full node … --test ops/src/application/runtime.stack.test.ts` | **13 pass / 0 fail**，63s（进程级子集 ~50s） |

### 6. 未决问题与产品缺陷报告（移交 PM）

1. **Spec 疑问（`CMD-008` × `CMD-009` 交互，建议裁决后修订 Spec 或 ops）**：`--json` 下"启动成功后运行期失败"会向 stdout 先后写出**两个** JSON 对象（地址清单 + 错误对象），而 CMD-008 要求"stdout 只含一个错误 JSON 对象"。复现：`ops runtime backend --data test --product-port <p> --data-port <d> --json`，就绪后 `kill -9` Data 子进程 → stdout 2 行、exit 20、`CHILD_EXITED`。当前测试按现状断言（首行 `ok:true`、末行错误对象），未掩盖该差异。可选修法：① Spec 增补"运行期失败允许 追加 错误对象"；② ops 把启动清单也移到 stderr（破坏 CMD-009 的"stdout 纯净"）；③ 运行期失败时只在 stdout 输出错误对象（地址清单只在成功启动时输出）。
2. **`integration --watch` 的重建原子性未实现**（RUNTIME 已记录，SPIKE-002 范围）：重建窗口内可能出现半写产物/资源 404。本期不作为验收门槛，但 `MODE-004` 的 `--watch` 分支与 `FAIL-007` 因此只有编排单测级证据。
3. **缺口清单（标"部分"的场景）**：`CMD-008`（§6-1）、`MODE-004 --watch` 分支、`FAIL-004`（未用真实损坏前端复现，`runtime.test.ts` 已覆盖编排逻辑：不启动栈 + 20 + `BUILD_FAILED`）、`FAIL-007`（未跑真实 `--watch` 长跑）。
4. **RUNTIME 移交项仍在**：`docs/guides/testing.md` 的「基础门禁」仍写 `go test ./...` 与 `npm run …`（该文件不在 RUNTIME/TESTING 写集内），需 PM 指派 owner 同步为 Rust 三件套 + pnpm 脚本；Go 源码/`cmd/`/`internal/` 的物理删除仍是待用户确认的独立步骤。
5. **MOCK 移交项仍在**：`crates/product/src/http.rs` 与 `crates/mock/src/http.rs` 各持一份逐字相同的 `scene` 常量（以及 wire 投影/clock/dates 副本），修改 `sceneCode` 必须双改；共享提案（上移 `protocol::scene`/`protocol::wire`）待 PM 裁定。`/mock/diagnostics` 不经 Vite 代理（前端页面读不到当前场景）仍开放。
6. **BACKEND 移交项仍在**：`BLOG_WEB_DIR` 指向不存在目录时 Product 不快速失败（页面 404 + 日志可诊断）；是否改为启动期校验待裁定。
7. **测试基础设施注意**：`ops quality check` 会完整执行一次 `cargo test --workspace`，因此"quality check + 单独 cargo test"会重复跑 Rust 套件（约 30s × 2），属预期行为，仅提示时长；本工作流曾观察到一次默认套件偶发失败，复盘为当时上一轮门控运行遗留的孤儿 mock 进程/临时库所致（`dispose` 收割孤儿进程修复后，连续 3 次默认套件 + 2 次全量门控运行均稳定全绿）。
