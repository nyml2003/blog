---
kind: workstream
id: WORKSTREAM-OPS-RUNTIME-MOCK
status: completed
plan_id: PLAN-OPS-RUNTIME-DEV-001
role: backend
owner: backend
depends_on: [WORKSTREAM-OPS-RUNTIME-PRODUCT, WORKSTREAM-OPS-RUNTIME-BACKEND]
write_set: [crates/ 中 Mock Product API 相关代码, Rust mock fixtures]
last_reviewed: 2026-09-06
---

# Mock Product API（Rust）

## 目标

实现项目专用的 Rust Mock Product API：独立 HTTP server，不是前端进程内拦截器，也不做通用 Faker 或完整后端模拟。

## 输出

- 覆盖现有公共/管理路由及 `sceneCode` 分支的有限命名场景：`default`、`empty`、`slow`、`server-error`、`malformed-response`，以及带状态的创建/发布/刷新/会话失效边界；
- 固定 seed 的文章数据生成器；
- 跨请求状态：显式 session header（如 `X-Blog-Mock-Session`）隔离，每次 runtime 启动/测试运行重新初始化；
- 响应遵循 Product 外部契约（路径、方法、envelope、领域错误码）。

## 约束

- `--scenario` 仅 CLI 参数，默认 `default`，不走环境变量或配置文件；
- 不实现完整数据库或后端状态机；
- 前端 Client 注入与 interceptor 归 `WORKSTREAM-OPS-RUNTIME-FRONTEND`，不向业务组件泄漏 Mock 专用类型。

## 验收

- 前端 `dev` 模式只连接 Mock server；
- 同一显式 session 可跨页面、刷新和相邻流程验证状态；
- 场景切换可复现。

---

## 交付记录（2026-09-06，WORKSTREAM-MOCK 第一批）

### 1. 交付物与文件清单

`crates/mock`（binary 名 `mock`，同时带 lib target 供集成测试复用；无 SQLite、无 Data 依赖）：

```text
Cargo.toml                      # workspace members 增补 "crates/mock"；mock 不新增任何依赖
crates/mock/Cargo.toml          # bin "mock" + lib "mock"；deps: protocol/tokio/axum/serde/serde_json
crates/mock/src/main.rs         # 进程入口（parse → run）
crates/mock/src/lib.rs          # 模块面 + 重导出（Cli/EXIT_*/run）
crates/mock/src/logging.rs      # [mock] 前缀宏（stdout 常规 / stderr 失败，与 product/data 同约定）
crates/mock/src/cli.rs          # --listen <IP:PORT>（仅回环）、--scenario <NAME>；EXIT_USAGE=10 / EXIT_RUN_FAILURE=20
crates/mock/src/scenario.rs     # 场景集合、SLOW_DELAY_MS=2000、TRUNCATE_BYTES=24、SeedKind/Fault
crates/mock/src/seed.rs         # 固定 seed（显式表，与 crates/data/src/fixture.rs 对齐）
crates/mock/src/domain.rs       # 单个 session 的内存数据 + typed operations 语义（对齐 Data 领域规则）
crates/mock/src/store.rs        # session 隔离：匿名空间 + 命名 session 表（TTL/LRU）+ 计数
crates/mock/src/contract.rs     # 对外 wire 投影：{code,message,data} envelope + camelCase + shelf BFF 分组
crates/mock/src/http.rs         # 路由/sceneCode/envelope/错误码（对齐 crates/product/src/http.rs）+ 场景注入点
crates/mock/src/server.rs       # 启动即重置状态 → bind → accept → 两段式优雅关停
crates/mock/src/clock.rs        # RFC3339 UTC（与 data/src/clock.rs 同实现；仅管理写入用真实时钟）
crates/mock/src/dates.rs        # exclusive_date_end（与 data/src/dates.rs 同实现）
crates/mock/tests/common/mod.rs # 进程级测试夹具：真实 binary + 最小 HTTP/1.1 client（端口用 127.0.0.1:0）
crates/mock/tests/http_contract.rs  # default 场景响应面 + 错误面 + session 隔离（3 tests）
crates/mock/tests/scenarios.rs      # empty / slow / server-error / malformed-response（4 tests）
crates/mock/tests/lifecycle.rs      # 退出码 10、CLI-only 场景、seed 稳定、两段式关停、重启重置（6 tests）
```

单元测试（`src/*` 内）36 个 + 进程级集成 13 个 = **49 个新测试**；workspace 总测试数 41 → 90，全部通过。

### 2. CLI 契约

```text
mock [--listen <IP:PORT>] [--scenario <NAME>]
```

| 项 | 行为 |
| --- | --- |
| `--listen` | 仅回环地址（非回环 → 退出码 `10`）；缺省 `127.0.0.1:9090`（对齐 Spec 候选端口） |
| `--scenario` | 只走 CLI；缺省 `default`；**不读任何环境变量、不读配置文件**（ENV-002） |
| 未知场景名 | 退出码 `10`，stderr：`[mock] usage: unknown scenario 'chaos' (valid: default, empty, slow, server-error, malformed-response)`；无前缀匹配/模糊回退 |
| 未知选项 / 非法地址 | 退出码 `10`（`--web-port` 等 ops 专属参数在子进程侧同样是 usage 错误） |
| `--help` / `-h` | stdout 帮助（含场景表、session 头、端点），退出码 `0` |
| 启动 | `starting scenario=… listen=… sessions=isolated pid=…` → `listening addr=127.0.0.1:<实际端口>`（供 ops 读取实际绑定） |
| 关停 | 两段式：`signal received signal=SIGINT/SIGTERM` → `phase=1 stop accept` → `phase=2 in-flight requests drained`（预算 5s，只在信号之后起算）→ `shutdown complete scenario=… requests=N writes=N faults=N`，退出码 `0` |

### 3. 场景 × 端点行为定义表

场景 = 「seed 形态 + `/api/*` 注入」两个正交维度的有限组合；同一场景对所有路由一致。

| 端点（sceneCode） | `default` | `empty` | `slow` | `server-error` | `malformed-response` |
| --- | --- | --- | --- | --- | --- |
| seed | 完整（9 published + 3 draft、3 类型、4 term、6 推荐） | 空集合 | 完整 | 完整 | 完整 |
| `GET /api/public/articles`（`public.article_list`） | 200 envelope，分页 `page/pageSize/total/hasMore` | 200，`items:[] total=0 hasMore=false` | 200，延迟 **2000ms** 后正常 | **500** `{code:"INTERNAL_ERROR",message:"mock scenario 'server-error' is active; no data is served",data:null}` | **200** + 截断 JSON body（不可解析） |
| `GET /api/public/articles`（`public.article_detail`） | 200 详情；draft/不存在 → 404 `ARTICLE_NOT_FOUND` | 任何 id → 404 | 同 default（延迟后） | 500 envelope | 200 + 截断 body（404 路径也被破坏） |
| `GET /api/public/article-types` / `/api/public/terms`（`…type_list` / `term_list`，`kind` 过滤） | 200 数组（类型按 `name` 序） | 200 `[]` | 同 default | 500 | 200 + 截断 body |
| `GET /api/public/recommendations`（`public.recommendation_current`） | 200，6 篇详情投影 | 200 `[]` | 同 default | 500 | 200 + 截断 body |
| `GET /api/public/mobile/article-shelf`（`public.mobile_article_shelf`） | 200：推荐 section（≤3 卡）在前 + 类型分区（空分区隐藏）+ `type-<id>` 兜底；`total` = 完整筛选结果数 | 200：`sections:[] total=0` | 同 default | 500 | 200 + 截断 body |
| `GET /api/admin/articles`（`admin.article_list` / `admin.article_detail`） | 200：list 只回 `{items,total}`（含 draft）；detail 可见 draft | 200：`items:[] total=0` | 同 default | 500 | 200 + 截断 body |
| `POST /api/admin/articles`（`admin.article_create` / `update` / `publish` / `unpublish`） | 200 详情；领域失败码原样：422 `INVALID_SUMMARY`、409 `INVALID_STATE_TRANSITION`、404 `ARTICLE_NOT_FOUND`、400 `INVALID_JSON` | 200，id 从 1 起，状态 draft | 同 default（延迟后） | **500 且不写状态**（故障在业务逻辑之前短路） | 200 + 截断 body，**状态仍被修改** |
| `GET /api/admin/article-types` / `/api/admin/terms`；`POST …`（`…_create` / `…_update`） | 200；create 回单对象、update 回 `data:null`；冲突 409 `DUPLICATE_NAME`、404 | 200 `[]`；create 可用 | 同 default | 500 且不写 | 200 + 截断 body，写生效 |
| `POST /api/admin/recommendations`（`admin.recommendation_generate`） | 200，按最近更新的 6 篇已发布重建并在当前 session 生效 | 200 `[]` | 同 default（延迟后） | 500 且不写 | 200 + 截断 body，集合仍被重建 |
| `GET /healthz` | 200 `text/plain` `ok\n` | 同 | 同（**不延迟**，就绪探测不受影响） | 同（200） | 同 |
| `GET /mock/diagnostics` | 200 envelope：`scenario` / `session{header,named,namedCapacity,ttlMs,expirations,evictions}` / `requests{apiTotal,writesAttempted,faultsServed}` / `unknownSessionPolicy` | 同 | 同 | 同（**不受故障影响**，是「现在什么场景」的观察出口） | 同 |
| 非 `/api`、非 `/healthz`、非 `/mock/diagnostics` | 404 `text/plain` `404 page not found\n`（不挂静态目录） | | | | |

方法/sceneCode 分支与 Product 逐字一致：公开 articles 非 GET → 405 `METHOD_NOT_ALLOWED`；其余公开端点非 GET 或 sceneCode 不符 → 400 `UNKNOWN_SCENE_CODE`；admin articles 非 GET/POST → 405；admin article-types / terms 非 GET/POST → 400 `UNKNOWN_SCENE_CODE`；admin recommendations 非 POST → 405；`id` 非整数/非正数 → 400 `INVALID_ID`；body 非法 JSON → 400 `INVALID_JSON`。

`malformed-response` 的精确定义：序列化后的 envelope body 从**尾部截掉 `TRUNCATE_BYTES = 24` 字节**（body 短于 24 字节时截成空 body），`Content-Type: application/json` 与 HTTP 200 保持不变——因此客户端观察到的是「200 + 解析失败」，且 body 是合法 body 的严格前缀（两次运行之间可复现、可对比）。

### 4. Session 策略与状态边界

请求头 `X-Blog-Mock-Session`（与 `web/common/client/mock-session.ts` 的 `MOCK_SESSION_HEADER` 逐字一致，前端经 `?mock-session=<id>` 显式选择）。

| 边界 | 行为（已测试） |
| --- | --- |
| 无 header / 值为空白 | 归入**匿名空间**：一个独立的 `DomainState`，与其他空间互不可见（`"   "` 与缺省等价；值先 trim） |
| 未知 session id | **接受并按需初始化**（策略常量 `unknownSessionPolicy = "accept-and-seed"`）：任意非空白值都是合法 id，创建即从场景 seed 开始，不需要先调用「建 session」接口。选择「接受」而非「拒绝」：前端把 `?mock-session=<id>` 写进地址栏即可获得干净状态 |
| 创建/发布可见性 | 同一 session 的写对后续读可见（跨页面、刷新、相邻流程）；其他 session 与匿名空间完全不可见（含公开 detail 的 404） |
| 刷新（`admin.recommendation_generate`） | 只改当前 session 的生效集合：t1 刷新后 t1 的推荐首项变为新建文章，匿名空间仍是 seed 集合 |
| 会话失效 | 闲置 > `SESSION_TTL = 30min` 的 session 在下一次请求时**重置为场景 seed**（写入全部丢弃，`expirations` 计数 +1）；测试用 `with_ttl(0/1ms)` 在毫秒级复现 |
| 容量上限 | 命名 session > `MAX_SESSIONS = 32` 时淘汰**最久未使用**者（LRU），被淘汰者复活时回到 seed（`evictions` 计数 +1），防无界增长 |
| 初始化时机 | 进程启动即全量重置（匿名空间 + 空 session 表）；测试断言「t1 写入 → 重启 → t1 读回 seed」 |

诊断端点回显 `session.named`（当前活跃 session 列表）与计数，供 ops/前端联调时直接观察隔离面。

### 5. Seed 说明

- **对齐 Data**：`crates/mock/src/seed.rs` 与 `crates/data/src/fixture.rs` 是同一份数据（12 篇文章：9 published + 3 draft、3 类型、4 term、推荐 `[12,11,10,9,8,7]`、`FIXTURE_STAMP` 同值），因此前端在 `ops runtime backend --data test`（真实）与 `ops runtime dev`（Mock）之间切换时看到的 id/标题/顺序完全一致，断言不用改。
- **「生成器」取舍**：用显式表而非 PRNG——可复现性由「没有随机源」直接保证，不为 Mock 引入 `rand`；跨运行/跨进程逐字节一致（测试对比 6 个端点的原始 body）。
- 时间字段：seed 内是常量；只有管理写入的 `createdAt/updatedAt/publishedAt` 用真实时钟（与真实 Product 行为一致，让前端能观察「服务端维护时间字段」）。
- 与 Data 的两处有意差异：①Mock 不做查询计数（不参与 N+1 验收）；②类型/term 的内联引用（`articleType`/`terms`）从**当前 session 的集合**解析，admin 新建的类型/term 立即出现在已有文章的投影里（Data 的 mock 后端读静态表，新建类型不出现在旧文章引用中）。

### 6. 验证命令与输出摘要

门禁（workspace 全量，均 0 warning / 全绿）：

```text
cargo build --workspace                 → Finished `dev` profile
cargo clippy --workspace --all-targets  → Finished（无 warning）
cargo fmt --all --check                 → clean
cargo test --workspace                  → 90 passed / 0 failed
  data 34（25+3+4+2）｜ product 7（4+1+1+1）｜ mock 49（36 单元 + 3 + 6 + 4 进程级）
```

进程级测试覆盖：每个场景至少 1 个列表端点 + 1 个写端点；session 隔离与可见性；seed 两次启动逐字节一致；未知场景退出码 10 且列出合法值；SIGINT/SIGTERM 两段式关停顺序与「无排空超时」；`malformed-response` 实际观察（200 + 前缀截断 + `serde_json` 解析失败）；重启重置状态；ENV-002（`SCENARIO=empty BLOG_SCENARIO=empty` 下启动日志仍是 `scenario=default`，数据 total=9）。

`ops runtime dev` 联动验证（真实跑，`node --experimental-strip-types ops/src/interface/cli.ts runtime dev`）：

```text
$ runtime dev --web-port 5977 --mock-port 19194
[ops] mock: 候选端口 19194, 实际绑定 19194
[mock] [mock] listening addr=127.0.0.1:19194 scenario=default session_header=X-Blog-Mock-Session
[ops] web: 候选端口 5977, 实际绑定 5977 / VITE ready / [ops] mock 就绪 / web 就绪 / 访问入口: http://127.0.0.1:5977

① 经 Vite 代理读 Mock：/api/public/articles?sceneCode=public.article_list&pageSize=2
   → total=9 page=1 pageSize=2 hasMore=true first=12 "Ops runtime 验收清单"（camelCase + envelope）
② session t1 创建 + 发布（经代理，带 X-Blog-Mock-Session: t1）
   → created id=13 status=draft type="Field Notes" terms=["runtime"]
   → published id=13 status=published publishedAt=2026-09-05T22:06:02
③ 可见性（session 隔离真实验证）
   t1          → public total=10 first=13 ｜ admin total=13
   (no header) → public total=9  first=12 ｜ admin total=12
   t2          → public total=9  first=12 ｜ admin total=12
④ /mock/diagnostics（直连 mock 端口）→ scenario=default namedSessions=["t2","t1"] requests={apiTotal:9, writesAttempted:2, faultsServed:0}
⑤ $ runtime dev --scenario slow --web-port 5974 --mock-port 19191
   → [mock] starting scenario=slow …；/healthz 直连 200 in 0.0011s；/api 经 Vite 代理 200 in ~1.97s
     （mock 自身请求日志 delaying_ms=2000、elapsed_ms=2002；健康检查不延迟）
⑥ SIGINT → ops exit code = 130；mock 依次打印
     signal received signal=SIGINT → phase=1 stop accept → phase=2 in-flight requests drained
     → shutdown complete scenario=default requests=9 writes=2 faults=0
   无遗留 mock / vite 进程，5977、19194 均恢复 free
```

### 7. 共享代码决策（复用 / 复制 / 理由）

| 内容 | 决策 | 理由 |
| --- | --- | --- |
| `protocol` 的 typed operations、`ArticleListQuery`/`ArticleWrite`/`ArticleListPage`/`DataOutcome`…、`OperationFailure`、`envelope::codes`、`http_status`、`has_more`/`normalize_page`/`normalize_page_size` | **复用**（path 依赖） | `protocol` 零运行时依赖，其 crate 文档明示允许 Mock 复用；保证 Mock 与 Product/Data 的层间类型和分页归一化完全一致 |
| `crates/product/src/contract.rs`（envelope + camelCase DTO + `to_shelf` BFF 分组） | **复制**为 `crates/mock/src/contract.rs` | 属于 `product` crate 私有实现，不能改兄弟 crate 的既有代码；Mock 需要同一 wire 形状，故复制并保留同一测试断言（camelCase、`Option` 省略、shelf 空分区隐藏） |
| `crates/data/src/fixture.rs`（seed 数据表） | **复制**为 `crates/mock/src/seed.rs` | `data` crate 带 SQLx/线程池，Mock 依赖它会拖入 SQLite 编译依赖并违背「Mock 无数据库」的语义；表内容保持一致并有测试锁定形状 |
| `crates/data/src/clock.rs`、`dates.rs`（RFC3339、`exclusive_date_end`） | **复制**（各 ~60 行，含少量测试） | 同上，避免 `data` 依赖；实现注释已标注来源 |
| `crates/data/src/store/mock.rs` 的领域语义（可见性、排序、状态机、摘要上限、唯一约束） | **重新实现**（同规则、不同载体） | Mock 的载体是 `protocol::ArticleDetail` 列表 + session 隔离，没有 `OpCtx`/查询计数/取消；规则本身用测试逐条对齐 |
| **共享提案（下一批，需 PM 裁定）** | ① 把 Product/Mock 共用的 wire 投影上移为 `protocol::wire`（envelope + camelCase DTO + shelf 分组）；② 把 `sceneCode` 常量上移为 `protocol::scene`（Product 与 Mock 现在各有一份逐字相同的 `scene` 模块，是唯一会静默漂移的重复）；③ `clock`/`dates` 可下沉为 `protocol`（或独立 `blog-util`）零依赖模块。落地后 `crates/mock` 的 `contract.rs`/`scene`/`clock`/`dates` 四处副本可删 | 消除跨 crate 复制；需要同时改 `product`（改引用）与 `protocol`（新增模块），超出本批次 write set，故只提出不动手 |

### 8. 与 Product 的刻意差异（已写入代码注释，非漂移）

1. 诊断端点是 `/mock/diagnostics`（场景 + session + 请求计数），不是 `/product/diagnostics`（Data 调用计数）；Mock 没有 Data 依赖，也没有静态挂载，未知路径一律 404 `text/plain`。
2. `/healthz` 与 `/mock/diagnostics` **不受场景影响**：就绪探测与「当前是什么场景」的观察通道必须始终可用（`slow` 不延迟它们，`server-error`/`malformed-response` 不破坏它们）。
3. `server-error` 在业务逻辑之前短路（写不生效）；`malformed-response` 在响应序列化之后破坏 body（写仍生效）——两者是不同的故障层，便于前端分别观察 HTTP 错误路径与解析失败路径。

### 9. 未决问题 / 交接

1. **ops 侧日志双前缀**：ops 对子进程输出统一加角色前缀，而三个 Rust 子进程自身也带前缀，实际输出形如 `[mock] [mock] listening addr=…`（product/data 同样如此）。不阻塞 LOG-001（来源仍唯一且稳定），但建议由 RUNTIME 工作流在 `ConsoleRuntimeLog::log` 里识别「已带前缀」的行，或由子进程去掉自身前缀——需要 PM 指定归属，未动 ops。
2. **`/mock/diagnostics` 不经 Vite 代理**：`web/vite.config.ts` 只代理 `/api`，因此诊断端点只能直连 mock 端口（前端页面访问不到）。若前端联调需要从页面读取当前场景，需要 FRONTEND/RUNTIME 决定是否加代理路径。
3. **共享提案**（第 7 节）待 PM 裁定后另立小批次；在此之前 `scene`/wire 投影存在两份逐字相同的副本，修改 `sceneCode` 时必须**同步**改 `crates/product/src/http.rs` 与 `crates/mock/src/http.rs`。
4. **场景常量**：`SLOW_DELAY_MS = 2000`、`TRUNCATE_BYTES = 24`、`SESSION_TTL = 30min`、`MAX_SESSIONS = 32` 目前硬编码在 `crates/mock/src/scenario.rs` / `store.rs` 并已写入 `--help` 与交付记录；按 Spec 约束这些不是 CLI 参数，若未来需要可配，应先修订 Spec 再加参数。
5. **前端接线**：`web/common/client/mock-session.ts` 的 interceptor 与 `?mock-session=<id>` 读取已就绪并有单测；把 interceptor 挂进 dev 模式 Client 的 composition root 归 `WORKSTREAM-OPS-RUNTIME-FRONTEND`，本工作流只保证 header 名与语义一致。
