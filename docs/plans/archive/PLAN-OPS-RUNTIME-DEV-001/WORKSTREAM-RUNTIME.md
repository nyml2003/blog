---
kind: workstream
id: WORKSTREAM-OPS-RUNTIME-CORE
status: completed
plan_id: PLAN-OPS-RUNTIME-DEV-001
role: frontend-core
owner: frontend-core
depends_on: [WORKSTREAM-OPS-RUNTIME-PRODUCT]
write_set: [ops/src/, docs/guides/operations.md, AGENTS.md]
last_reviewed: 2026-09-06
---

# Runtime 进程编排、端口与日志

## 目标

实现运行模式的子进程启动、端口分配、环境注入、日志转发和统一退出。

## 约束

- 通过实际绑定确认端口，有界递增，以实际绑定结果注入依赖；
- 关键服务使用带来源前缀的 stdout/stderr 转发：`[web]`、`[product]`、`[data]`、`[mock]`、`[ops]`；
- Ctrl-C 和关键子进程退出触发可预测清理；
- 顶层退出码：`0` 成功、`10` 用法/配置错误、`20` 执行失败、`130` SIGINT；`--json` 输出机器可读错误；
- `ops runtime serve` 与 `ops database migrate` 直接删除，不保留兼容别名（迁移由 Data Server 启动时自动执行）；
- 退出码全局统一为 `0`/`10`/`20`/`130`/`143`：修订 `cli.ts` 用法错误、`help.ts` `leafExitCodes` 与既有命令的 `1`，同步修订 `SPEC-OPS-USABILITY-004` 相关测试及 `docs/guides/operations.md`、`AGENTS.md` 中 serve/migrate/go run 条目。

## 验收

- 三种模式与 `delivery build` 的进程组合正确；
- 端口冲突和耗尽可诊断；
- 子进程失败能显示服务名、退出码和相关日志；
- 退出后没有遗留子进程。

## 交付记录

### 2026-09-06 RUNTIME 第一批（frontend-core）

修改范围（全部在 `ops/src/`、`docs/guides/operations.md`、`AGENTS.md`，未触碰 `crates/`、`web/` 与 Go 代码）：

- 退出码全局统一：`interface/cli.ts` 用法错误 `2`→`10`（未捕获异常兜底 `1`→`20`），`interface/help.ts` `leafExitCodes` 自动补码 `2`→`10`；`workspace doctor`、`quality *`、`delivery build` 的执行失败 `1`→`20`，受影响的契约测试与帮助文本同步修订。`SPEC-OPS-USABILITY-001` v2 已由产品侧修订，本批完成其"实现侧待办"。
- 删除命令：`runtime serve`（registry 条目、`runServe`）与 `database migrate`（registry 条目、`database` 分组、`BLOG_MIGRATE_ONLY` 逻辑）逐文件精确删除；未知命令行为不变（exit 10），已删命令给出迁移提示（`serve`→`runtime integration`，`migrate`→`runtime backend`/`integration`）。
- 进程编排原语：`domain/ports.ts` 新增 `ManagedProcess`/`ProcessGroupPort`/`ProcessSupervisor`/`LogLine`/`ProcessExit`/`ReadinessProbe`/`PortProbe`/`BinaryResolver`/`RuntimeLog`/`SignalPort`；`infrastructure/process.ts` 新增 `ManagedChildProcess`（逐行转发、末行无换行也转发、stderr 不丢、最近 50 行环形缓冲、`kill(signal)`、退出事件与退出码）、`ProcessGroup`（传播信号→等待→限期后 SIGKILL→等待收尾）、`NodeProcessSupervisor`、`ConsoleRuntimeLog`、`NodeSignals`；既有 `NodeProcess.run()` 单次执行语义保持不变（check/quality/build 仍使用）。
- 端口管理：`domain/port-allocation.ts`（1024–65535、禁 `0`、候选窗口 +0…+9、同次运行端口互斥、`PORT_EXHAUSTED` 含尝试清单）+ `infrastructure/net.ts`（`TcpPortProbe` 实际 bind 确认、`TcpReadiness` TCP connect 探测，可取消）。
- 三模式命令：`runtime dev [--scenario] [--web-port] [--mock-port]`、`runtime backend [--data mock|test] [--product-port] [--data-port]`、`runtime integration [--watch] [--product-port] [--data-port]`，`delivery build` 改为前端 + `cargo build --release`（`go build` 分支删除，Go 代码未动）。编排逻辑在 `application/runtime.ts`（可注入端口，测试不依赖真实 Rust binary）；`--dry-run` 无副作用打印计划；`--json` 输出 Spec 定义的两个结构。
- 文档：`docs/guides/operations.md` 重写运行模式/已删除命令章节；`AGENTS.md` 命令清单与退出码说明更新。

实现期决定（附录 A，需与 backend 对齐后回写 Spec 表）：

- binary 名取自 `[[bin]] name`：`product`、`data`、`mock`（mock crate 未合入，`dev` 模式在缺失时返回 `SERVICE_START_FAILED`/20，这本身是契约行为）。
- 注入面：Vite `BLOG_API_ORIGIN`（既有接缝）、Data `BLOG_DATABASE_PATH`（backend `crates/data/src/semantics.rs` 已消费，路径 `target/test-dbs/<ops 运行 PID>.db`，目录由 ops 预创建）、Product `BLOG_DATA_ORIGIN`、integration 挂载 `BLOG_WEB_DIR`；子进程端口用 `--port <N>` 参数，Mock 场景用 `--scenario <NAME>` 参数。`BLOG_DATA_ORIGIN`/`BLOG_WEB_DIR` 两个名字尚未被 backend 消费，确定后必须回写 Spec 并同步修改 `domain/runtime.ts`。
- `integration --watch`：先以 `pnpm --filter blog-web run build` 作为门禁（FAIL-004），随后启动 `build --watch` 长驻进程（`[web]` 前缀）；watcher 退出按 `BUILD_FAILED` 处理并停止服务栈（FAIL-007）。"重建窗口内的原子切换"未实现（SPIKE-002 范围）。
- `--json` 模式下 stdout 只含一个 JSON 对象，子进程日志与 `[ops]` 进度全部转移到 stderr（stdout 纯净与 LOG-001 的取舍，已写入 `--help` 说明）。

验证：

- `node --experimental-strip-types --test 'ops/src/**/*.test.ts'`：57 个测试全绿（新增 `domain/port-allocation.test.ts`、`infrastructure/process.test.ts`（真实 node 子进程：逐行转发、末行 flush、spawn 失败、SIGTERM/SIGKILL 升级、无遗留进程）、`infrastructure/net.test.ts`（真实 bind/connect 探测）、`application/runtime.test.ts`（模式计划、注入、端口耗尽、启动失败、子进程退出、信号 130/143、dry-run、`--json` 结构、watch）；`interface/cli.test.ts`/`help.test.ts` 改为退出码 10/20 与新命令面断言）。
- 冒烟：`ops runtime dev --dry-run`、`ops delivery build --dry-run`、`--json --dry-run` 输出计划且 exit 0；`ops runtime dev`、`ops runtime backend --json` 在 binary 缺失/即时退出时返回结构化 `SERVICE_START_FAILED` + exit 20；`ops runtime dev --web-port 700` exit 10（stderr 解释 + stdout 最近帮助）；`ops runtime serve`、`ops database migrate` exit 10 且给出迁移目标；`ops help`、`ops runtime` 帮助已无 serve/migrate。
- 另验证 pnpm 参数转发：`pnpm --filter blog-web run dev --port 5199` 实测 Vite 监听 5199（pnpm 会把 `--` 原样传给脚本，因此不使用 `--` 分隔符）。

未决项：

- `ops quality check` 仍包含 `gofmt`/`go vet`/`go test`（Go 退场归后续批次，见 PLAN 验收 7）。
- `runtime integration` 真实启动、`MODE-001`–`MODE-004`、`PORT-002`/`PORT-003`/`PORT-005`、`FAIL-001`–`FAIL-007` 的端到端证据依赖 backend binary 与 TESTING workstream。当前实测：`ops runtime integration` 会先完成前端构建，再在 Data 启动阶段以 `SERVICE_START_FAILED`/20 结束——因为 `crates/data` 的 binary 尚不接收 `--port`（clap 报 `unknown option '--port'`）。**注入标识符的最终形态（`--port` 参数 vs `BLOG_*` 环境变量）需要 backend 拍板后回写 Spec**；ops 侧只需改 `application/runtime.ts` 的 `spawnRequest()`。
- Mock crate 未合入，`dev` 模式当前必然以 `SERVICE_START_FAILED` 结束；Mock 的 `--scenario`/`--port` 参数形态需 WORKSTREAM-MOCK 确认。

### 2026-09-06 RUNTIME 第二批（frontend-core）：对齐 backend 注入契约 + 首次真实端到端

对齐内容（以 `crates/data/src/cli.rs`、`crates/product/src/cli.rs` 的真实定义为准，未改 `crates/` 与 Spec）：

- 监听：`--port <N>` → **`--listen 127.0.0.1:<port>`**（backend 要求 `<IP:PORT>` 且仅回环）。
- Data 实际地址 → Product：`BLOG_DATA_ORIGIN` → **`BLOG_DATA_ADDR`**，值 `http://127.0.0.1:<port>`（与 Product 诊断端点回显一致）。
- `BLOG_WEB_DIR` 不变（绝对路径）；本批同时显式传 `--web-dir`（backend 参数优先级：显式参数 > 注入 env > 默认值，两者同值）。
- `BLOG_DATABASE_PATH` 不变，值固定为**绝对文件路径** `<root>/target/test-dbs/<ops 运行 PID>.db`（backend 直接可用；Data 日志回显 `injected=true`）。`BLOG_API_ORIGIN`（Vite）不变。
- Data 现在显式收到 `--data-semantics mock|test`（不再依赖 backend 默认值，满足 ENV-004"无隐式默认"）。

真实端到端证据（binary 来自 `target/debug`，backend 第一批交付）：

- `ops runtime backend --data test`：Data 注入路径生效（`injected=true`）、迁移 `count=2`、seed `articles=12`，`GET /healthz` → `ok`/200，`GET /api/public/articles?sceneCode=public.article_list` → `code=OK` 且 `items=9`（published）；SIGINT → **exit 130**、无遗留进程、Data 自行删除 `target/test-dbs/<pid>.db`（`temp db removed … files=1`，目录为空）。
- `ops runtime backend --data mock`：`sqlite disabled (mock semantics: no database file is created or opened)`、`storage=memory`；运行后 `target/` 下无任何 `.db`/`-wal`/`-shm` 文件（MODE-002 证据）；SIGINT → exit 130、无遗留进程。
- 端口递增（PORT-002/PORT-004/PORT-005 真实证据）：预占 8081 后启动，Data 落在 **8082**，Product 候选 8080/8081 均不可用落在 **8083**，`[ops]` 诊断打印 `候选端口 8080, 实际绑定 8083（递增尝试: 8080, 8081, 8083）`；Product 诊断端点回显 `dataClient.authority = 127.0.0.1:8082`，即"打印的地址、注入给依赖方的地址、实际绑定结果"三者一致。
- `--json`（CMD-008/CMD-009）：stdout 仅 1 行 JSON（`services` 含 Data/Product 实际端口、`entry: null`），人类可读日志全部在 stderr；用该 payload 里的端口 curl `/healthz` → 200。
- 日志前缀：`[ops]`/`[data]`/`[product]` 每行齐备，`[ops]` 失败摘要走 stderr。

验证：`node --experimental-strip-types --test 'ops/src/**/*.test.ts'` 57/57 通过（含对齐后的 `--listen`/`--data-semantics`/`BLOG_DATA_ADDR`/绝对库路径断言）；`ops quality check` exit 0。

未决项（更新）：

- **环境事实**：本机（WSL2）`127.0.0.1:8080` 被外部（Windows 侧）长期占用且 `ss`/`/proc/net/tcp` 不可见，因此 Product 的默认候选 8080 在本机几乎总会触发递增（实测落在 8082/8083）。行为符合契约且可诊断；如需固定端口请用 `--product-port`。建议 PM 把"WSL2 下 8080 常被占用"记入运行环境事实，供 MOCK/TESTING 工作流参考。
- **backend Product 当前批次的 `DRAIN_BUDGET` 让 Product 启动约 5s 后自行以 0 退出**（`tokio::select!` 的 5s 分支），因此 `runtime backend`/`integration` 会在 5s 后进入"Product 已退出、Data 仍在"的半活状态，ops 按契约记录 `[ops] product 已退出 (exit 0)` 并继续等待其余服务（FAIL-005 只约定非零/信号退出为失败）。需要 backend 确认这是骨架占位还是最终语义；若是占位，ops 侧无需改动。
- Mock crate 未合入：`dev` 模式仍按契约返回 `SERVICE_START_FAILED`/20；`--scenario`/`--listen` 形态需 MOCK workstream 确认。
- `MODE-004`（Product 挂载 `web/dist`）依赖 backend 下一批；ops 侧注入（env + `--web-dir`）已就绪。

### 2026-09-06 RUNTIME 第三批（frontend-core）：FAIL-005 判定补强 + 退出码表澄清

Spec 补强（产品侧已修订）后的实现调整，全部在 `ops/src/application/runtime.ts`、`ops/src/interface/registry.ts` 与测试：

- **FAIL-005 判定**：`waitModeEnd` 不再有"首个子进程干净退出则继续等待其余"的分支。运行态下任一服务子进程退出——非零、被信号杀死、或**未经 ops 关停发起的 `exit 0`**——一律 `CHILD_EXITED`/20，并停止同模式其余进程。诊断含服务名、退出码与最近日志。`watch` 的重建进程退出仍按 `BUILD_FAILED`/20 分类（FAIL-007）。
- **关停路径不误判**：信号到达 → `stopAll` → 直接返回 130/143；由 ops 自己发起的 kill 所造成的子进程退出不再进入退出分类逻辑（无 `isFailedExit` 判定残留），信号路径也没有 `errors` 输出，测试中有断言。
- **运行模式无 0 退出路径**：删除 `waitModeEnd` 的 `return 0`；现在真实运行只能以 `20`/`130`/`143` 结束（`--dry-run` 仍为 0，属 Spec 保留项；`delivery build` 成功仍为 0）。帮助文本同步：三个 runtime 叶子的 `0` 含义改为"`--dry-run` 打印计划（运行中的模式没有 0 退出路径，正常停止只能是 130/143）"，`20` 含义改为"…或运行中的服务退出"；`docs/guides/operations.md` 退出码说明同步。
- 启动期死亡仍归 `SERVICE_START_FAILED`（FAIL-003），与运行态 `CHILD_EXITED` 分开。

验证：`node --experimental-strip-types --test 'ops/src/**/*.test.ts'` **59/59**（新增两条：运行中 `exit 0` → 停栈 + `CHILD_EXITED`/20 + `exitCode:0` 进 JSON details；以及"模式只能经信号正常结束"的 SIGINT/SIGTERM 参数化用例）。原有"模式返回 0"的断言全部改为信号收尾（130/143）。`ops quality check` exit 0，无遗留子进程。

### 2026-09-06 RUNTIME 第四批（frontend-core）：日志单前缀 + 质量门禁切换（workstream 闭环）

1. **日志双前缀去重（LOG-001）**：新增 `domain/runtime.ts` 纯函数 `withLogPrefix(role, message)`——行首已匹配 `^\[(web|product|data|mock|ops)\] ` 时原样返回，否则补 `[role] `。应用点收敛在 `infrastructure/process.ts` 的 `ConsoleRuntimeLog.log/error`（转发的子进程行与 ops 自身进度共用一条规则），`forwardLines`/`emitCaptured` 无需感知。效果：Rust 服务自带的 `[mock]`/`[data]`/`[product]` 前缀不再被重复，Vite/pnpm/cargo 等无前缀行仍按转发角色加前缀。测试：`withLogPrefix` 五种来源 + 无尾随空格的边界（`port-allocation.test.ts`），以及经真实 `ConsoleRuntimeLog` 的路由断言（`process.test.ts`）。
2. **质量门禁切换（PLAN 验收 7 的门禁部分）**：`application/check.ts` 移除 `gofmt`/`go vet`/`go test`，改为 Rust 三件套 `cargo fmt --all --check`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo test --workspace`；Cargo workspace 缺失时判失败并说明（不静默通过）。`workspace doctor` 清单从 go/node/pnpm/rustc/cargo/sqlite3 收敛为 **node/pnpm/rustc/cargo**，`quality check` 的描述与 `--dry-run` 计划行同步。Go 代码文件未动（删除是后续经用户确认的独立步骤）。新增 `application/check.test.ts` 三条（门禁顺序与旧门禁消失、workspace 缺失 → false + `fail:cargo workspace`、Rust 命令失败 → 整体失败）。

验证：

- `node --experimental-strip-types --test 'ops/src/**/*.test.ts'` **64/64**；`ops quality check` **exit 0**（新门禁全绿：cargo fmt / clippy -D warnings / cargo test --workspace、ops 契约测试、pnpm 四项、前端依赖边界）；`ops workspace doctor` 输出 node/pnpm/rustc/cargo 四项 OK。
- `ops runtime dev --scenario empty --mock-port 9291 --web-port 5299` 冒烟：`[mock] starting scenario=empty listen=127.0.0.1:9291 …`（单前缀）、Vite 无前缀行落为 `[web] $ vite --port 5299` / `[web] VITE v8.2.2 ready`，stdout+stderr 中双前缀行数为 **0**，`http://127.0.0.1:5299/` → 200，SIGINT → **exit 130**、无遗留进程。Mock 的 `mock [--listen <IP:PORT>] [--scenario <NAME>]` 契约与 ops 现有注入一致，无需改动。

未决项（移交给 PM）：

- `docs/guides/testing.md` 的「基础门禁」清单仍写着 `go test ./...` 与 `npm run …`（该文件不在 RUNTIME 写集内），需要 owner 同步为 Rust 三件套 + pnpm 脚本。
- Go 代码文件、`cmd/`、`internal/` 的物理删除与 `workspace doctor`/`delivery build` 中残留的 Go 痕迹（现已无）仍待后续经用户确认的独立步骤。

### 2026-09-06 RUNTIME 第五批（frontend-core）：移除 `Workspace.server`

Go 物理删除（`cmd/blog-server/` 不复存在）后的收尾：`Workspace.server` 在 `runServe`/`database migrate` 删除后已无任何消费者，从 `domain/workspace.ts` 的类型与 `resolveWorkspace` 中移除，三个测试 double（`commands.test.ts`、`runtime.test.ts`、`check.test.ts`）的 `server: '/repo/cmd/blog-server'` 同步删除。`ops/src/application/check.ts` 的 Rust 门禁未改动。验证：`node --experimental-strip-types --test 'ops/src/**/*.test.ts'` 77 项（65 通过 / 12 跳过，0 失败；跳过项为 `application/runtime.stack.test.ts` 的真实栈用例）；`ops quality check` exit 0。
