---
kind: workstream
id: WORKSTREAM-OPS-RUNTIME-BACKEND
status: in_progress
plan_id: PLAN-OPS-RUNTIME-DEV-001
role: backend
owner: backend
depends_on: [WORKSTREAM-OPS-RUNTIME-PRODUCT]
write_set: [Cargo.toml, crates/, Rust migrations]
last_reviewed: 2026-09-06
---

# Rust 后端：workspace、Product、Data 与迁移

## 目标

建立仓库根 Cargo workspace 与 Rust Product API、Data Server 服务 binary。Go 代码仅作行为、数据库结构和 HTTP 契约参考，最终从运行、构建、质量门禁和文档当前架构中移除，无双栈兼容期。Mock Product API 的专项细节见 `WORKSTREAM-MOCK.md`（写集同为本 workstream 的 `crates/`，两者不可并行）。

## Spike 门禁（已完成，结论归档）

- 2026-09-05 完成：纯 std 组合可行但有代价，未触发暂停分支；证据见交付记录。
- 2026-09-06 用户决策改用 Tokio `current_thread` + axum/hyper，Spike 约束（无 Tokio/无 async-await）随之废止；`crates/spike*` 产物归档待清理。

## 输出

- Cargo workspace 布局：共享 `protocol` crate（层间类型），Product 内部网关与业务语义独立 crate，Data、Mock 各自 binary；
- Product API（Tokio `current_thread` + axum/hyper）：公开 API、BFF、领域语义；不访问 SQLite；
- Data Server：同步线程池（I/O 8 线程 + CPU 1 线程）；业务侧有界通道 `try_send` 投递（满则 503），`oneshot` 回程；不做 `core_affinity` 物理绑核，同 runtime 内分层用 crate + trait 边界表达；
- 契约化横切面：deadline 沿链路传播（禁止外层短于内层的倒挂）；协作式取消（回程通道关闭即取消信号，检测后回到 `recv()`，不退出线程）；SIGTERM 关停顺序（停止 accept → 逐层 drop 通道句柄 → 限期约 5s 退出）；
- SQLx：`runtime-tokio` + `SqlitePool` + `sqlx::migrate!()`；统一运行期 `sqlx::query` API，不用 `query!` 宏；
- Data API 使用按领域定义的 typed operations，不做表 CRUD 或通用查询语言；
- N+1 边界：Product→Data 调用次数与结果条目数无关；Data→SQLite 保持固定查询数量；排序 `updated_at DESC, id DESC`。

## 验收

- 外部 Product HTTP 契约（路径、方法、`sceneCode`、JSON envelope、领域错误码）保持兼容；
- `ops runtime backend --data mock|test` 下 Product 无 SQLite 依赖；
- test 语义每次运行使用新的临时 SQLite，自动迁移并加载稳定 seed；
- 通道背压（满则 503）、协作式取消与关停顺序可测试复现（对应 PLAN 验收 9）。

## 交付记录

- 2026-09-05：实施前门禁 Spike 完成，**结论：可行但有代价，门禁通过**（未触发"暂停 Rust 方案评审"分支）。产物：仓库根 `Cargo.toml` + `crates/spike`（executor/HTTP，零依赖）+ `crates/spike-sqlx`（SQLx 验证）。`cargo build`/`clippy` 0 warning、`cargo test` 2/2 通过；`Cargo.lock` 无 tokio/async-std/smol/async-io/mio 等任何 runtime crate；`crates/` 源码 `grep -iE 'tokio|async|await'` 0 命中（含注释，可机械审计）。
  - **executor：可行（干净）**。`std::task::Wake` + `thread::park` 手写 `block_on`；单测覆盖立即 Ready 与跨线程唤醒。
  - **HTTP I/O：可行但有代价**。std 无 fd 就绪通知（epoll 不在 std、mio 非 std）。两种已实测策略：`SelfWake`（自我唤醒，空闲烧满一核，延迟 ~1ms）与 `ExecutorTimeSlice`（`park_timeout` 时间片，空闲 0 CPU，延迟 ~时间片 5ms@10ms）。注意：自我唤醒会击穿 `park_timeout`（unpark 许可残留），两种策略不可叠加。本地 dev 场景时间片策略足够。
  - **SQLx：可行但有代价（连接级可用，Pool 不可用）**。`sqlx 0.8.6`、`default-features=false, features=["sqlite"]` 可编译且依赖树干净；手写 `block_on` 可驱动 `SqliteConnection` 完成 connect/查询/DDL/迁移/close。但 `SqlitePool` 构造即 panic（`AsyncSemaphore` 硬性要求 `runtime-tokio`/`runtime-async-std` feature，两者都违反硬约束）；`Migrator::new(dir)` 同样依赖 `rt::spawn_blocking`。**已验证替代**：手写 ~30 行迁移 runner（读 `*.sql` + 版本表）在纯 `["sqlite"]` feature 下可用。
  - **待决策（已提交用户）**：① Data Server 用 `SqliteConnection` 直连、不用 Pool、连接生命周期自管；② HTTP 等待策略本期取时间片轮询、不引入 mio（维持 PLAN 现状）；③ 迁移用手写 runner 而非 `sqlx::migrate!()`（避免 `macros` feature 拉入重编译依赖）；④ 正式实现统一用运行期 `sqlx::query` API（`query!` 宏未验证）。
  - 遗留注意：本机有 HTTP 代理，ops 未来健康检查需直连（`--noproxy` 类语义）；`target/` 编译缓存约 861M 可删；std 无定时器，超时类能力需与 readiness 策略统一自建。
- 2026-09-06：用户决策本期采用 Tokio `current_thread` + axum/hyper，推翻“无 Tokio/无 async-await”约束；公网 TLS 部署与 B 端认证后置另立 plan（含 4 条架构修订：去层间通道改 crate+trait 边界、去绑核、P50 目标限定 keep-alive 复用连接、内存预算放宽至 ≤50MB 量级实测）。上条 Spike 结论转为归档参考：`SqlitePool` 与 `sqlx::migrate!()` 随 `runtime-tokio` 恢复可用，手写 executor/迁移 runner 不再需要。
- 2026-09-06（本批）：**运行链路优先交付完成**（不含全部业务端点）。
  - **修改范围**：新增仓库根 `Cargo.toml`（workspace，3 成员 + 依赖版本统一）与 `crates/protocol`、`crates/data`、`crates/product`；Rust migrations 在 `crates/data/migrations/`（内容按 Go `migrations/001`、`002` 逐条移植，见下「迁移位置」）。未触碰 Go 代码、`ops/src/`、`web/`、`flake.nix`、其他 docs。
  - **迁移位置选择**：放在 `crates/data/migrations/` 而非 workspace 级目录——`sqlx::migrate!()` 以调用处 crate 根解析路径，且迁移目前只被 Data 一个 binary 使用；workspace 级目录需要额外路径覆盖且无共享需求。
  - **注入标识符（附录 A 回写完成）**：`BLOG_DATA_ADDR`（Data 实际地址 → Product）、`BLOG_WEB_DIR`（`web/dist` → Product）、`BLOG_DATABASE_PATH`（test 库路径 → Data）；形态为环境变量；监听地址走进程参数 `--listen`（固定回环），不设环境变量；优先级 显式参数 > 注入环境变量 > 默认值。已回写 `SPEC-OPS-RUNTIME-001`「环境变量与配置注入」表与附录 A。
  - **架构落地**：Data = Tokio `current_thread`（axum/hyper 承载 HTTP）+ 同步线程池（I/O 8 线程 / 通道 64，CPU 1 线程 / 通道 4）+ `crossbeam_channel::try_send` 投递 + `tokio::sync::oneshot` 回程；通道满 → `503 BACKPRESSURE`（envelope `{code,message,data}`）；协作式取消以回程通道关闭为信号，`diagnostic_slow` 在批次间隙检查后回到 `recv()`；关停两段式（常驻等信号 → 停止 accept → 限期 2s 排空 → drop lane 句柄 → worker 限期 3s 退出 → 关连接池 → 删临时库，合计 5s）。SQLx 用 `runtime-tokio + sqlite + migrate + macros`，运行期 `sqlx::query` API（未用 `query!`）；同步 worker 经 `Handle::block_on` 驱动 Pool。
  - **两个实测教训（影响后续实现）**：① `Handle::block_on` 从普通线程驱动 Pool 可行（0.1s 验证），但**测试/调用方不得在 runtime 线程内阻塞 join**，否则 current_thread 驱动不被推进而假死；② sqlx 在 `PoolConnection` drop 时会 `rt::spawn` 归还连接，要求线程处于 tokio 上下文，故 `SqliteStore` 用 `Conn{ conn, _enter }` 守卫（**字段顺序即 drop 顺序**：连接先于 `Handle::enter` 守卫释放），否则 worker 线程 panic「this functionality requires a Tokio context」。另有 ③：排空限时必须**在收到信号之后才起算**（`serve()` 先 `select` 于 server 与信号，再进入限期排空），若把 deadline 与 server 一起 `select`，进程会在启动 2s 后自行退出——该缺陷由进程级集成测试捕获并修正。
  - **typed operations**：已实现 4 个业务 operation（`article_list` 固定 3 查询 = count + 当前页 + 批量 terms `IN(...)`；`article_get` 2 查询；`article_type_list`/`term_list` 各 1）+ 3 个诊断 operation（`diagnostic_echo`/`diagnostic_slow`/`diagnostic_digest`）。Go 参考实现的 `List()` 是 `2 + N` 次查询（逐条 `loadTerms`），Rust 版改为固定 3 次；类型名改在页查询 JOIN 取回，terms 用一次 `IN` 覆盖整页。查询数经 `Meter` 计入响应头 `x-blog-data-query-count`、日志与 `/data/v1/diagnostics`，可被测试断言。
  - **数据语义**：`mock`（内存夹具，`describe()` 返回 `None`，实测运行期 `target/test-dbs` 文件数不变）；`test`（`target/test-dbs/<PID>.db`，`sqlx::migrate!()` 自动迁移 + 稳定 seed（9 published / 3 draft、空摘要样本、推荐集合），正常退出删 `.db/-wal/-shm`，SIGKILL 保留）；`prod` 仅枚举位，选中即退出码 `10` 快速失败。
  - **Product 骨架**：`/healthz`、`/api/public/articles`（`sceneCode=public.article_list`，1 次 Data 调用）、`/product/diagnostics`（注入配置 + Data 计数器）；外部契约 camelCase、envelope `{code,message,data}`；未挂载 `web/dist`（只接收/记录 `BLOG_WEB_DIR`），未实现完整公开/管理路由。Data client 用 hyper 1（`client+http1`）+ `hyper-util::TokioIo` + `http-body-util`，未引入 `reqwest`。
  - **验证（实际执行）**：`cargo build` 通过；`cargo clippy --all-targets` **0 error / 0 warning**；`cargo fmt --check` 通过；`cargo test` **30 通过 / 0 失败**（data 单测 19 + store 集成 4 + HTTP 进程级 3 + product 单测 3 + Product→Data 链路 1）。`cargo build --release` 通过（`opt-level="z"` + `lto="thin"` + `strip`，产物 `data` ≈2.9MB / `product` ≈1.3MB，release binary 冒烟请求通过）。手工 curl 验证：test 语义启动即迁移+seed、`/healthz`、`article_list`（含 `x-blog-data-query-count: 3`）、未知 operation → 400 `UNKNOWN_OPERATION`、`/data/v1/diagnostics`；SIGTERM 退出码 0 且日志顺序为 signal received → phase=1 stop accept → phase=2 drained → phase=3 release lane handles → workers exited 9/9 → temp db removed → shutdown complete，`target/test-dbs/<PID>.db` 已删；SIGKILL 后 `.db/-wal/-shm` 保留；mock 语义运行前后 SQLite 文件数不变；`prod` 语义与未知参数均退出码 `10`。链路手工验证：`BLOG_DATA_ADDR` 注入后 `items=1 data_calls=1 data_queries=3` 与 `items=9 data_calls=1 data_queries=3`（调用数与条目数无关），Data 诊断 `query_count_total` 增量 6 = 2 次 × 3；`BLOG_WEB_DIR` 环境注入经 `/product/diagnostics` 的 `webDirInjected` 确认，`webDirMounted=false`。
  - **未决项**：① `SPEC-OPS-RUNTIME-001`「边界与失败」仍写"唯一遗留的实现期子项是附录 A 命名"，附录 A 已由本次回写关闭，该句需 PM 修订（超出 backend 写集，未改）；② ENV-004 / PORT-005 场景正文中"标识符按附录 A 于实现期确定"字样可随 PM 下一轮一并改为"按附录 A 命名"；③ `ops delivery build` / `ops runtime backend` 的编排侧验收归 RUNTIME 工作流，本批只提供服务 binary 契约与注入点。
  - **留给下一批**：完整公开/管理端点与 `sceneCode` 全集、摘要校验/状态迁移、mobile shelf BFF；`web/dist` 静态挂载（`integration`）；Mock Product API binary（`crates/mock`）；Product 网关 crate 拆分（现集中在 `crates/product/src/{data_client,contract,http}.rs`，拆分是机械动作）；推荐（`recommendation`）typed operations；请求级 N+1 指标持久化/记录格式；Data client keep-alive 连接复用。
- 2026-09-06（第二批）：**RUNTIME 端到端缺陷修复 + Product 业务端点全集 + `web/dist` 静态挂载**。
  - **缺陷修复（RUNTIME 报告：product 启动约 5s 自行 `exit 0`）**：`crates/product/src/main.rs` 的 `tokio::select!` 残留 `sleep(DRAIN_BUDGET)` 分支，与 Data 教训 ③ 同款——排空限时从启动即起算。修法与 Data 一致：先在 server 与信号之间 `select!`（信号之前进程常驻），再进入限期排空；同时把信号源收敛为单个 `watch` channel（此前 graceful-shutdown future 与显式等待各自安装监听，会重复打两条 "signal received"）。回归测试 `crates/product/tests/residency.rs`：启动 → 连接成功 → 等待 7s（> DRAIN_BUDGET 5s）仍存活且 `/healthz` 可用 → SIGTERM 后退出码 0，日志顺序 `signal received → phase=1 stop accept → phase=2 drained → shutdown complete`，并断言日志中不出现 "drain budget exceeded"。
  - **修改范围（第二批）**：`crates/protocol/src/{operation,envelope,lib}.rs`（新增 11 个 typed operation 与 `ArticleShelfData`/`ArticleWrite` 等载荷、`INVALID_SUMMARY`/`INVALID_STATE_TRANSITION`/`DUPLICATE_NAME` 失败码及 HTTP 映射）、`crates/data/src/{clock,store/*}.rs`（写入/状态迁移/推荐/shelf）、`crates/product/src/{http,contract,static_files,main}.rs`（全部路由 + BFF + 静态挂载）、`crates/data/tests/write_ops.rs`、`crates/product/tests/{contract,residency}.rs`。写集仍为 `Cargo.toml`/`crates/`，未触碰 Go 代码、`ops/src/`、`web/`、其他 docs。
  - **Go → Rust 契约覆盖对照**（均由进程级测试 `crates/product/tests/contract.rs` 断言）：
    - `publicArticles` GET list → `GET /api/public/articles` + `public.article_list`：envelope、`page/pageSize/total/hasMore`、排序 `updated_at DESC, id DESC`、3 次固定查询；
    - `publicArticles` GET detail → 同端点 + `public.article_detail`：200 含 `contentHtml`；草稿 404 `ARTICLE_NOT_FOUND`；`id=abc` 400 `INVALID_ID`；
    - `publicTypes` → `GET /api/public/article-types` + `public.article_type_list`；`publicTerms` → `GET /api/public/terms` + `public.term_list`（`kind` 过滤、`kind,name` 排序）；`publicRecommendations` → `public.recommendation_current`（6 条、详情级投影、只含 published）；
    - `publicMobileShelf` → `GET /api/public/mobile/article-shelf` + `public.mobile_article_shelf`：推荐 section ≤3 卡片在前、类型 section `type-<id>` 按 `name` 序、空分区隐藏、`hasFilters/warnings`、卡片不含正文、带筛选不返回推荐；
    - `adminArticles` GET list/detail → `admin.article_list`（仅 `items`+`total`，含草稿）/`admin.article_detail`；POST → `admin.article_create`/`article_update`/`article_publish`/`article_unpublish`（200 返回详情、409 状态机、422 摘要、404 缺失、400 非法 JSON）；
    - `adminTypes` → `GET/POST /api/admin/article-types`（`article_type_list`/`create`/`update`，409 `DUPLICATE_NAME`，update 成功 `data:null`）；`adminTerms` → `GET/POST /api/admin/terms`；`adminRecommendations` → `POST /api/admin/recommendations`（`recommendation_generate`，最近更新第一）；
    - `frontendHandler` → Product 静态挂载兜底：页面映射、`/assets/*` 内容类型、未知路径/深层刷新 404 text/plain、非 GET/HEAD 405。
  - **N+1 边界（第二批新增 operation 的固定语句/查询数）**：`article_create` / `article_update`（写 + 多值 terms 单语句 + 回读 2 + commit，语句数只随 payload 的 term 数变化，不随结果集）、`article_publish` / `article_unpublish`（select 状态 + update + 回读 2 + commit）、`recommendation_current` = **3**（推荐 id + 详情行 + 批量 terms，禁止逐条 `GetArticle`）、`recommendation_generate` = **7**（单事务）、`article_shelf` = **7**（不含推荐时 4）。mock 后端按同一逻辑步骤计数，两个语义指标可比；`crates/data/tests/write_ops.rs` 逐一断言。
  - **SPIKE-001 观察结果（`SPEC-OPS-RUNTIME-001-SPIKE-001`，Product 静态挂载 vs Go 实现）**：
    - 有映射路径（`/`、`/articles/index.html`、`/m`、`/m/`、`/admin`、`/admin/`、`/admin/index.html`、`/admin/articles/{new,edit,preview}.html`、`/admin/{article-types,terms}/index.html`）→ 200 `text/html`，与 Go 完全一致（含无尾斜杠目录路径命中同一 `index.html`）。
    - 未知路径（`/nope`、`/assets/missing.js`、`/assets/`）→ `404` + `text/plain` `404 page not found`，与 Go 的 `http.NotFound` 一致。
    - 无尾斜杠但不在映射表的目录路径（`/articles`、`/articles/`、`/m/articles`）与深层刷新路径（`/admin/articles/edit`，去 `.html` 的路由）→ 404；**无 SPA 回退**（Go 同样 404）。
    - 非 GET/HEAD → 405 `method not allowed`（Go 一致）；`/api/` 未知子路径 → 404（Go：落到 frontendHandler，一致）。
    - Rust 特有差异：目录穿越（`/assets/../...`）与反斜杠显式 404（Go 依赖 `http.FileServer` 路径清洗）；映射文件缺失时打印 `[product] static file missing path=…`（Go 静默 404）。
    - **建议的"静态挂载路由契约"（供 PM 决策是否入 Spec）**：① 页面精确映射、不做 SPA 回退，未知路径 404；② 404 响应保持 `text/plain` `404 page not found`（前端不解析该响应体）；③ `/healthz` 优先于静态兜底；④ 目录穿越一律 404；⑤ 缺失映射文件按 404 并记 `[product] static file missing`。若前端需要 `/m/articles/detail` 这类无后缀路由，需前端路由改造或补充映射表，不属于本次静态挂载行为。
  - **与 Go 参考实现的有意差异（均记录，待 PM 确认）**：① 分类/term 重命名目标不存在返回 `404 NOT_FOUND`（Go 一律 `409 DUPLICATE_NAME`，疑似缺陷；如需严格兼容，Product 侧把 `NOT_FOUND` 翻译为 `DUPLICATE_NAME` 一行可改）；② POST 非法 JSON 一律 `400 INVALID_JSON`（Go 对 `adminTypes`/`adminTerms`/`adminRecommendations` 忽略解码错误，按空结构继续）；③ `publicArticles` 非 GET 返回 `405 METHOD_NOT_ALLOWED`，而 `publicTypes`/`publicTerms`/`publicRecommendations`/`mobileShelf` 非 GET 返回 `400 UNKNOWN_SCENE_CODE`（沿用 Go 的逐端点差异，未顺手统一）。
  - **验证（第二批，实际执行）**：`cargo build` 通过；`cargo clippy --all-targets` **0 error / 0 warning**；`cargo fmt` 已跑；`cargo test` **41 通过 / 0 失败**（data 单测 25 + data HTTP 进程级 3 + data store 集成 4 + data 写入/推荐/shelf 2 + product 单测 4 + Product→Data 链路 1 + 契约 1 + 常驻回归 1）。手工 curl 冒烟（高位端口 18340/18341/18350/18351，避开本机被占的 8080）：静态 `/`、`/m`、`/admin`、`/assets/app.js`、`/api` 同源；创建 → publish → 公开可见 → unpublish → 二次 unpublish 409；摘要 161 字 → `422 INVALID_SUMMARY` 且 Data 查询计数不变（before=after）；shelf 无筛选/带筛选两形态；推荐 generate/current；背压：灌满 Data io lane（90 个 `diagnostic_slow`）后 Product `dataBackpressureTotal>0`、503 envelope `BACKPRESSURE`，两进程均存活；SIGTERM 两进程退出码 0，日志顺序完整。
  - **留给下一批**：Mock Product API binary（`crates/mock`）；Product 网关 crate 拆分；Data client keep-alive 连接复用（当前每请求建连）；管理端点认证（对齐 `docs/architecture/backend.md` 当前限制）；请求级 N+1 指标持久化。
  - **未决问题（第二批，待 PM 裁定）**：① SPIKE-001 的路由契约建议与上述 3 处有意差异是否入 Spec；② `BLOG_WEB_DIR` 指向不存在目录时，当前行为是"页面全部 404 + 日志可诊断"（对齐 Go 的不校验），是否改为启动期快速失败；③ 契约测试用固定高位端口（18330–18351），与开发者本机端口冲突时会误报，RUNTIME 编排层后续可改为注入临时端口。
- 2026-09-06（收尾批，用户已批准）：**共享实现上移 `protocol`，删除 Product/Mock 的 4 处副本**（执行 MOCK workstream 提出的共享重构；此时 Go 代码已物理退场，Rust 栈为唯一实现）。
  - **上移了什么（全部只依赖 `std` + `serde`，保持 `protocol` 零运行时依赖）**：
    - `protocol::wire`（新增）：对外 HTTP 契约投影——`Envelope<T>`（`ok`/`failure`）、`ArticleTypeRef`/`TermRef`/`ArticleListItem`/`ArticleType`/`Term`/`ArticleDetail`/`ArticleListPage`、`ShelfCard`/`ShelfSection`/`ShelfData`，以及 `to_list_items`/`to_types`/`to_terms`/`to_detail`/`to_details`/`to_shelf`（**含 BFF 分组算法**：推荐 section ≤3 → 类型分组按 name 序 + 空分区隐藏 → `type-<id>`/`未分类` 兜底）。只 `Serialize`（两个服务都只序列化响应）。
    - `protocol::wire::code`：对外领域错误码集合（`UNKNOWN_SCENE_CODE`/`METHOD_NOT_ALLOWED`/`INVALID_ID`/`INVALID_JSON`/`INVALID_SUMMARY`/`INVALID_STATE_TRANSITION`/`DUPLICATE_NAME`/`ARTICLE_NOT_FOUND`/`NOT_FOUND`/`INTERNAL_ERROR`/`BACKPRESSURE`/`DEADLINE_EXCEEDED`）。原 Product 版多出 `BACKPRESSURE`/`DEADLINE_EXCEEDED` 两项，现取并集（Mock 背压透传需要）。
    - `protocol::scene`：19 个 `sceneCode` 常量 + `PUBLIC`/`ADMIN` 分组数组，并新增唯一性/前缀测试。
    - `protocol::clock`（服务端时间字段，RFC3339 UTC 9 位小数，字典序 == 时间序）与 `protocol::dates`（`exclusive_date_end` 排他日终点，含闰年），原为 `crates/data/src/{clock,dates}.rs`。
  - **删除的副本（4 处）**：`crates/product/src/contract.rs`、`crates/mock/src/contract.rs`（两份逐字相同的投影 + shelf 分组）、`crates/mock/src/clock.rs`、`crates/mock/src/dates.rs`（与 `data` 同实现，仅注释与测试子集不同）；`crates/data/src/{clock,dates}.rs` 移入 protocol 后原文件删除。三侧改为 `use protocol::wire::{self, Envelope}` / `protocol::scene` / `protocol::wire::code` / `protocol::{clock, dates}`，http.rs 内 32 处 `contract::` 调用点统一改名为 `wire::`。
  - **行为零变化**：重构是纯移动 + 合并，无逻辑改动；`shelf`/投影的边界语义（推荐截断 3、空分区隐藏、兜底 `未分类`、`Option` 字段省略、`data:null`）由合并后的 `protocol::wire` 测试锁定，Mock 的逐字节响应断言（`crates/mock/tests/http_contract.rs`，含 `default_scenario_serves_the_product_response_surface`）与 Product 的端到端契约测试（`crates/product/tests/contract.rs`）保持全绿。
  - **顺带清理**：`crates/product/src/static_files.rs` 与 `crates/product/tests/contract.rs` 头部对已删除路径（`cmd/blog-server/main.go`、`internal/httpapi/router.go`）的引用改为「与已移除的 Go 参考实现行为对齐（2026-09-06 退场）」，对照语义保留；其余 31 处无路径的"Go 参考实现"措辞未动。
  - **验证（收尾批，实际执行）**：`cargo fmt --all --check` 通过；`cargo clippy --workspace --all-targets -- -D warnings` **0 warning / 0 error**；`cargo test --workspace` **93 通过 / 0 失败**（重构前基线 90；净增 3 = `protocol::scene` 2 个新测试 + wire 测试合并后净差）；`ops quality check` **exit 0**（39 项 OK，含 `cargo fmt`/`cargo clippy`/`cargo test` 三件套）。
  - **未决问题（收尾批）**：① `wire` 投影目前只有 `Serialize`（无 `Deserialize`），若后续出现需要反序列化对外响应的场景（例如契约测试直接解析 envelope 为类型）需补 derive；② Mock 仍不依赖 `data` crate（避免 SQLx），夹具数据与 `data::fixture` 是"同一数据集的两份定义"（`protocol::fixture` 可作为进一步收敛点，但会把 seed 语义上移到 protocol，超出本批范围，未动）。
