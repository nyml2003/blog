---
kind: spec
id: SPEC-OPS-RUNTIME-001
status: accepted
owner: product
last_reviewed: 2026-09-29
---

# 运行模式、命令与进程契约

## 目的与范围

本 Spec 固定运行层的可观察契约：三种运行模式、`ops delivery build`、命令参数与显式值、数据与内容来源、模式 × 服务 × 端口矩阵、环境变量注入、进程生命周期和失败行为。

约束对象是 `ops runtime` / `ops delivery` 的**可观察行为**（命令面、进程组合、端口、注入、日志、退出码），不约束子进程内部实现。

## 非目标

- 不定义 Rust 服务内部结构、Tokio runtime 形态、线程池、通道实现或 SQLx 用法；这些属于实现边界，不由本 Spec 重定义。
- 不定义 Product 外部 HTTP 契约（路径、`sceneCode`、envelope、领域错误码）——沿用 `docs/architecture/data-and-api.md`（ARCH-DATA-API），本 Spec 只在背压场景引用其结果。
- 不定义 Mock 场景内容与 session 语义，本 Spec 只约束“如何用 CLI 选中场景”。
- 不做公网监听、TLS、守护进程化；本期所有监听地址固定为回环地址。
- E2E runner 由 `ops` 作为独立、显式的浏览器验收子命令管理；`integration` 本身仍不是浏览器自动化。

## 引用（引用而非重定义）

| 来源 | 引用内容 |
| --- | --- |
| `docs/architecture/data-and-api.md`（ARCH-DATA-API） | `sceneCode` 采用 `端点.场景` 命名；公开 `/api/public/*`、管理 `/api/admin/*`；响应 `{ code, message, data }` envelope；业务接口只用 `GET`/`POST` |
| `docs/specs/archive/SPEC-OPS-USABILITY-001.md` 系列 | 帮助等价入口、未知命令/选项/非法值的可观察行为（SPEC-OPS-USABILITY-004）、工作区未激活快速失败（SPEC-OPS-USABILITY-006） |
| `docs/guides/operations.md` | 运行模式、场景选择和本地服务入口 |
| `docs/content-repo/CONTRACT.md` | fixture/GitHub 内容来源、仓库结构与同步边界 |
| `src/frontend/common/client` | Client/Data 注入点与 `BLOG_API_ORIGIN` 接缝 |
| `src/frontend/vite.config.ts:12` | `BLOG_API_ORIGIN` 既有接缝，缺省 `http://127.0.0.1:8080`，仅代理 `/api` |
| `docs/FACTS.md` FACT-RUNTIME-001 | 2 核 / 2 GB / 40 GB 目标资源约束 |

## 命令用法

### 命令面总表

| 命令 | 参数 | 缺省行为 | 说明 |
| --- | --- | --- | --- |
| `ops runtime dev` | `--scenario <NAME>`、`--web-port <PORT>`、`--mock-port <PORT>`、全局 `--help`/`--dry-run`/`--json` | 有值参数全部必填，无默认值 | Vite dev + Mock Product API；不启动 Product/Data |
| `ops runtime backend` | `--content-source <fixture\|github>`、`--data <mock\|test>`、`--product-port <PORT>`、`--data-port <PORT>` | 有值参数全部必填，无默认值 | Product API-only + Data Server；不挂载前端，无 Vite |
| `ops runtime integration` | `--content-source <fixture\|github>`、`[--watch]`、`--product-port <PORT>`、`--data-port <PORT>` | content-source 与端口必填；watch 缺省 false | 前端构建（或 build `--watch`）+ Product + Data(test)；Product 挂载 `src/frontend/dist` |
| `ops delivery build` | 全局 `--dry-run`、`--json` | — | 构建 `src/frontend/dist` 与 Rust Product/Data/Mock 交付 binary，不启动任何服务 |

补充规则：

- 参数遵循 [SPEC-OPS-PARAMETERS-001](./SPEC-OPS-PARAMETERS-001.md)：有值参数全部显式必填，不从默认值或环境变量补齐；switch 出现 true、缺省 false，重复幂等，不接受赋值。帮助完整展示模型、范围和枚举，dry-run 仍须完整参数。
- 本文场景若只写运行模式名称，表示引用命令；实际执行必须补齐本表的所有必填参数。下方可执行示例均显式给值。

- `integration` 固定 `data=test`，**不提供** `--data`。需要 mock 语义时改用 `ops runtime dev` 或完整的 `ops runtime backend --content-source fixture --data mock ...`；不追加 `integration --data mock`（2026-09-06 PM 裁定，关闭 OPEN-7）。
- `backend` 与 `integration` 必须显式选择 `--content-source fixture|github`；它与 Data 的 mock/test 语义是两个独立维度。`dev` 固定使用 Mock 内置 fixture，不提供该参数。
- 本期**不提供** `--host`/`--listen`。被删除的 `ops runtime serve --listen`（原 env `BLOG_LISTEN_ADDR`）不复活；监听地址固定 `127.0.0.1`（本 Spec 不覆盖公网监听）。（2026-09-06 追认为正式契约）
- 端口覆盖参数命名为 `--web-port`/`--product-port`/`--data-port`/`--mock-port`，取值范围 `1024`–`65535`；不支持 `0`（系统临时端口）。越界或非整数按用法错误处理。（2026-09-06 追认为正式契约）
- `--scenario` 只接受当前 Mock runtime 注册的命名场景；未知场景名按用法错误处理，不做前缀匹配或模糊回退。
- session 隔离（`X-Blog-Mock-Session`）是**请求头**，不是 CLI 参数，也不提供 `--session` 之类选项。

### 示例

```text
ops runtime dev --scenario default --web-port 5173 --mock-port 9090
ops runtime dev --scenario empty --web-port 5173 --mock-port 9090
ops runtime dev --scenario slow --web-port 5173 --mock-port 9090
ops runtime backend --content-source fixture --data mock --product-port 8080 --data-port 8081
ops runtime backend --content-source fixture --data test --product-port 8080 --data-port 8081
ops runtime backend --content-source github --data mock --product-port 18080 --data-port 18081
ops runtime integration --content-source fixture --product-port 8080 --data-port 8081
ops runtime integration --content-source fixture --watch --product-port 8080 --data-port 8081
ops delivery build
ops delivery build --dry-run
ops runtime backend --content-source fixture --data mock --product-port 8080 --data-port 8081 --json
```

### 已删除命令

`ops runtime serve` 在本期直接删除，不保留兼容别名。原 `serve` 用户（构建 `src/frontend/dist` 后由单一服务同时提供页面、静态资源和 API）迁移到 **`ops runtime integration`**：同样是“先构建前端、再由后端进程挂载 `src/frontend/dist`、不启动 Vite”的形态，差异是后端从 Go 单进程换成 Rust Product + Rust Data(test) 两进程，且不提供 `--listen`。

`ops database migrate` 同期删除（2026-09-06 用户决策）。数据库迁移改为 **Data Server 启动时自动执行**（`sqlx::migrate!()`），不再提供独立迁移命令。原 migrate 用户：改用目标 runtime 模式（`backend` / `integration`）启动栈，等待 Data 就绪即代表迁移已完成；无法用独立命令"只迁移不启动"。

## 模式 × 服务 × 端口矩阵

"真实后端"指 Rust Product + Rust Data 链路；"Mock"指 Rust Mock Product API。

| 模式 | Vite (`[web]`) | Product (`[product]`) | Data (`[data]`) | Mock (`[mock]`) | 数据来源 | 最终访问地址 |
| --- | --- | --- | --- | --- | --- | --- |
| `runtime dev` | 启动，候选由 `--web-port` 显式指定 | 不启动 | 不启动 | 启动，候选由 `--mock-port` 显式指定 | Mock（场景由 `--scenario` 选定） | `http://127.0.0.1:<web 实际端口>` |
| `runtime backend --content-source <SOURCE> --data mock` | 不启动 | 启动，候选由 `--product-port` 显式指定 | 启动，候选由 `--data-port` 显式指定（mock 语义，内存夹具） | 不启动 | Data(mock)，无 SQLite 文件；内容按 SOURCE | 无页面入口；API 基址 `http://127.0.0.1:<product 实际端口>` |
| `runtime backend --content-source <SOURCE> --data test` | 不启动 | 启动，候选由 `--product-port` 显式指定 | 启动，候选由 `--data-port` 显式指定（test 语义） | 不启动 | Data(test)，每次运行全新临时 SQLite + 自动迁移 + 稳定 seed；内容按 SOURCE | 同上 |
| `runtime integration --content-source <SOURCE> [--watch]` | 不启动（先构建产物） | 启动，候选由 `--product-port` 显式指定，挂载 `src/frontend/dist` | 启动，候选由 `--data-port` 显式指定（test 语义） | 不启动 | Data(test)；内容按 SOURCE | `http://127.0.0.1:<product 实际端口>`（页面与 `/api` 同源） |
| `delivery build` | 不启动 | 不启动 | 不启动 | 不启动 | — | 无；产物在 `src/frontend/dist` 与 Rust binary |

规则：

- 任何模式启动的进程集合恰为矩阵所示，不出现矩阵之外的常驻进程（无 Go 进程、无独立 watcher 进程、无数据库守护进程）。
- `dev` 模式前端只连接 Mock，不连接 Product/Data；`backend`/`integration` 模式下不存在 Vite 进程，因此不存在前端代理。
- `backend`/`integration` 的 Data 语义由矩阵和 `--data` 规则决定，内容来源另由必填的 `--content-source fixture|github` 决定；两者不得互相推断。
- 矩阵中的端口是**候选值**；实际端口以绑定结果为准（见下节）。

## 端口分配与依赖注入

- **显式候选**：每个服务必须通过对应 `--*-port` 提供唯一候选起点；参数缺失或非法时退出 10，不启动服务。
- **有界递增**：候选端口被占用（`EADDRINUSE`）时，从候选值起逐次 +1 重试绑定；每个服务最多尝试 **10 个端口（+0 … +9）**，全部被占用即端口耗尽（2026-09-06 PM 裁定，关闭 OPEN-2）。
- **分配顺序**：按依赖方向分配——`backend`/`integration` 先 Data 后 Product；`dev` 先 Mock 后 Vite。已分配给本次运行其他服务的端口不再作为后续服务的候选（避免同次运行自撞，例如 Product 递增撞上 Data 已占用的 `8081`）。
- **实际绑定结果为唯一事实来源**：子进程收到的地址一律是实际绑定成功的地址（含递增后的端口），不允许子进程按默认值自行猜测。递增发生时，打印给用户的访问地址、注入给依赖方的地址、诊断信息三者必须一致。
- **绑定地址**：固定 `127.0.0.1`，不因端口参数改变。

## 环境变量与配置注入

| 变量 | 注入目标 | 值 | 说明 |
| --- | --- | --- | --- |
| `BLOG_API_ORIGIN` | Vite 进程（`dev` 模式） | Mock 实际绑定地址，如 `http://127.0.0.1:9090` | 复用既有接缝 `src/frontend/vite.config.ts:12`；缺省值 `http://127.0.0.1:8080` 仅在非 ops 直跑 Vite 时生效 |
| `BLOG_DATA_ADDR` | Product 进程 | `http://127.0.0.1:<data 实际端口>` | Data 实际地址 → Product（2026-09-06 实现期确定，附录 A）；显式参数 `--data-addr` 可覆盖 |
| `BLOG_WEB_DIR` | Product 进程（`integration` 模式） | 仓库内 `src/frontend/dist` 绝对路径 | 沿用既有环境变量名；显式参数 `--web-dir` 可覆盖。integration 由 Product 挂载静态目录 |
| `BLOG_DATABASE_PATH` | Data 进程（仅 `--data test`） | `target/test-dbs/<PID>`（2026-09-06 PM 裁定，关闭 OPEN-3/OPEN-5） | 沿用 Go 时期同名变量（2026-09-06 实现期确定，附录 A）；显式参数 `--data-database-path` 可覆盖；`mock` 语义下 Data 不读取该变量、不创建任何文件 |
| `BLOG_CONTENT_REPO` | Product 进程（仅 `--content-source github` 且调用环境已提供） | `owner/repository` | fixture 模式必须清除；GitHub 模式不凭空补值 |
| `BLOG_CONTENT_TOKEN` | Product 进程（仅 `--content-source github` 且调用环境已提供） | GitHub token | fixture 模式必须清除；不得写入日志或传给其他子进程 |

注入规则：

- **运行地址由 ops 决定**：`BLOG_API_ORIGIN`、`BLOG_DATA_ADDR`、`BLOG_WEB_DIR` 与 `BLOG_DATABASE_PATH` 由 ops 计算并覆盖调用者同名值；repo/token 则只在 GitHub 模式按调用环境中实际存在的值定向传给 Product。需要手工控制连接地址的开发者不使用 `ops runtime`，直接驱动子进程。
- **`--scenario` 只走 CLI**：必须显式选择，`default` 仅是合法名称；不读取环境变量、不读取配置文件。Mock 子进程通过命令行参数（而非环境变量）收到场景名。会话头 `X-Blog-Mock-Session` 由前端 Client interceptor 附加，不属于 ops 注入面。
- **注入面收敛**：ops 注入的运行配置只在 composition root / 进程启动参数层面被消费；页面与领域模型不出现 Mock 专用类型或 Mock 专用环境变量。
- **内容来源隔离**：fixture 模式清除环境中的 repo/token；GitHub 模式只把实际存在的 repo/token 传给 Product。缺失凭证不让 ops 暗中切换来源，Product 按内容仓库契约从 last-good 快照启动并让远程管理操作失败关闭。
- `mock` 语义下 Data 不创建、不打开任何 SQLite 文件；`test` 语义下每次运行使用全新临时 SQLite，自动迁移并加载稳定 seed。库文件位于 `target/test-dbs/`、以运行进程 PID 命名：**正常退出即删除，异常退出保留供诊断**。迁移不提供独立命令，由 Data 启动时自动执行。

## 退出码

顶层退出码**全局统一适用于所有 ops 命令**（2026-09-06 用户决策，关闭 OPEN-1）：`0` 成功、`10` 用法/配置错误、`20` 执行失败、`130` SIGINT、`143` SIGTERM。既有用法错误码 `2` 与执行失败码 `1` 语义**废止**，相关命令帮助、契约测试与 `SPEC-OPS-USABILITY-004` 已同步修订；内部保留更细错误码。

| 顶层码 | 触发条件（本 Spec 范围内） |
| --- | --- |
| `0` | `delivery build` 构建成功；`--dry-run` 打印成功。运行模式不存在 `0` 退出路径：正常停止只能由信号触发（`130`/`143`），任何服务自行退出按 `CHILD_EXITED` 以 `20` 处理（2026-09-06 PM 澄清） |
| `10` | 未知命令/选项、缺少参数、`--data` 或 `--content-source` 取值非法、端口参数越界或非整数、`--scenario` 未知场景、工作区环境未激活（SPEC-OPS-USABILITY-006） |
| `20` | 递增窗口内端口耗尽、关键服务启动失败、前端或 Rust 构建失败、运行中子进程异常退出、`--watch` 构建失败 |
| `130` | 用户 SIGINT（Ctrl-C）触发的主动退出，且清理完成 |
| `143` | ops 自身收到 SIGTERM（128+15），完成与 SIGINT 相同的清理后退出（2026-09-06 PM 裁定，关闭 OPEN-6） |

## 日志契约

- 每行日志带稳定来源前缀：`[web]`、`[product]`、`[data]`、`[mock]`、`[ops]`；前缀按**服务角色**而非进程 PID 命名。
- 子进程 stdout/stderr 逐行转发，不吞行、不合并多行；ops 自身产生的进度、地址、诊断与清理信息使用 `[ops]`。
- `[ops]` 的错误与失败摘要输出到 stderr；子进程转发与常规进度输出到 stdout（用法错误沿用 SPEC-OPS-USABILITY-004：stderr 解释、stdout 最近帮助）。
- 失败路径必须能从日志直接读出：服务名、退出码或失败原因、相关日志片段；不得只打印"失败"两个字。

## `--json` 输出

`--json` 同时覆盖错误输出与正常启动的地址清单（2026-09-06 PM 裁定，关闭 OPEN-9）。

### 错误输出

```text
{
  "ok": false,
  "command": "runtime backend",
  "exitCode": 20,
  "error": {
    "code": "PORT_EXHAUSTED",
    "message": "人类可读信息",
    "details": [ { "service": "data", "port": 8081 } ]
  }
}
```

- `code` 取值（本 Spec 范围内的稳定集合）：`USAGE`、`PORT_EXHAUSTED`、`SERVICE_START_FAILED`、`BUILD_FAILED`、`CHILD_EXITED`。
- 更细的内部错误码注册表归 Runtime 工作流；本 Spec 只约束以上可观察集合与字段稳定性。

### 正常启动地址清单

```text
{
  "ok": true,
  "command": "runtime integration",
  "services": [
    { "service": "product", "host": "127.0.0.1", "port": 8080, "url": "http://127.0.0.1:8080" },
    { "service": "data", "host": "127.0.0.1", "port": 8081, "url": "http://127.0.0.1:8081" }
  ],
  "entry": "http://127.0.0.1:8080"
}
```

- `services` 只含该模式实际启动的服务（见矩阵），`port` 为**实际绑定端口**（含递增结果）。
- `entry` 为人类可访问入口（`dev` 取 Vite 地址，`integration` 取 Product 地址）；`backend` 模式无页面入口，`entry` 为 `null`。
- `delivery build` 无服务，`services` 为空数组。
- `--json` 下不输出人类可读的横幅/进度行；stdout 使用 NDJSON。启动成功先输出地址清单，启动前失败只输出错误对象，运行期失败在地址清单后追加错误对象；最后一个已发对象表示最新生命周期事件。其余输出（子进程日志、`[ops]` 进度）走 stderr。

## 场景

每条场景标注强度分级（`Spike` / `Build` / `Acceptance`）。`Acceptance` 表示必须映射到自动化测试或人工证据后，才能确认本 Spec 的对应场景；`Build` 表示实现必须满足但可先以最小行为验证；`Spike` 默认隔离，只记录观察，不作为验收门槛。

### 命令面

#### SPEC-OPS-RUNTIME-001-CMD-001

强度：Acceptance

Given 新开发者未阅读本 Spec，只进入项目环境
When 执行 `ops help` 或 `ops runtime --help`
Then 帮助能区分三种运行模式的目的、是否连接真实后端、是否有页面入口，并给出最终访问地址形态，使开发者无需其他文档即可选对模式。

#### SPEC-OPS-RUNTIME-001-CMD-002

强度：Acceptance

Given 项目环境已激活
When 执行 `ops runtime dev`（无参数）
Then 退出 10，提示缺少必填字段且不启动任何进程；显式提供 `--scenario default --web-port 5173 --mock-port 9090` 后才启动 Vite 与 Mock，不启动 Product 或 Data。

#### SPEC-OPS-RUNTIME-001-CMD-003

强度：Acceptance

Given 项目环境已激活
When 执行 `ops runtime backend`，或缺少 `--content-source`，或在完整参数中分别传 `--data mock`、`--data test`、`--data prod`
Then 无参数、缺少内容来源及 prod 均按用法错误退出 10 且不启动进程；完整 mock/test 参数分别选择对应数据语义，内容来源独立按 fixture/github 选择。

#### SPEC-OPS-RUNTIME-001-CMD-004

强度：Acceptance

Given 项目环境已激活
When 显式提供 `--content-source` 和 product/data 两项端口后，分别执行 integration 不带及带 `--watch`
Then 数据语义固定为 `test`，命令不接受 `--data`（出现即用法错误）；缺少内容来源按用法错误处理；不带 `--watch` 时前端只构建一次，带 `--watch` 时进入构建监视。

#### SPEC-OPS-RUNTIME-001-CMD-005

强度：Acceptance

Given 仓库已切换到 Rust 服务栈
When 执行 `ops delivery build`
Then 只构建 `src/frontend/dist` 与 Rust Product/Data/Mock 交付 binary，不编译任何 Go 目标，不启动任何服务进程，成功后退出码 `0`。

#### SPEC-OPS-RUNTIME-001-CMD-006

强度：Acceptance

Given `ops runtime serve` 已删除且不保留别名
When 执行 `ops runtime serve` 或 `ops runtime serve --listen 127.0.0.1:8080`
Then 按 SPEC-OPS-USABILITY-004 返回未知命令错误、不产生任何进程副作用，且错误或帮助中提示迁移目标 `ops runtime integration`。

#### SPEC-OPS-RUNTIME-001-CMD-007

强度：Build

Given 任一运行模式或 `delivery build`
When 执行并附加 `--dry-run`
Then 只打印将启动的进程、模式、候选端口与将执行的构建步骤，不绑定端口、不写文件、不启动子进程，退出码 `0`。

#### SPEC-OPS-RUNTIME-001-CMD-008

强度：Acceptance

Given 任一运行模式或 `delivery build`
When 以 `--json` 触发本 Spec 定义的一个失败场景
Then stdout 的每一行都是一个 JSON 对象（NDJSON），**最后一行为终止状态**：启动前失败 → 仅一行错误对象；启动成功后运行期失败 → 先输出地址清单对象、再输出错误对象。`code` 属于稳定集合，`exitCode` 与进程真实退出码一致，且该结构在两次运行间保持字段稳定。（2026-09-06 PM 修订：原"只含一个 JSON 对象"未覆盖长驻模式的生命周期事件，由 TESTING 真实栈用例暴露；机器消费以最后一行为终止状态。）

#### SPEC-OPS-RUNTIME-001-CMD-009

强度：Acceptance

Given 任一运行模式在所有服务就绪后正常启动
When 以 `--json` 启动并读取 stdout
Then 得到单个「正常启动地址清单」JSON：`services` 恰为该模式矩阵中的服务、端口为实际绑定结果，`entry` 指向该模式的人类访问入口（`backend` 为 `null`，`delivery build` 为空数组），且无其他人类可读输出。

### 模式与服务组合

#### SPEC-OPS-RUNTIME-001-MODE-001

强度：Acceptance

（对应运行模式验收场景）
Given `ops runtime dev` 已启动
When 开发者访问 Vite 地址并发起页面数据请求
Then 请求到达 Mock Product API，Mock 以显式 session 维护跨请求状态，链路上不存在 Product 或 Data 进程。

#### SPEC-OPS-RUNTIME-001-MODE-002

强度：Acceptance

（对应运行模式验收场景）
Given `ops runtime backend --content-source fixture --data mock` 已启动
When 检查进程组合与数据链路
Then 只有 Product 与 Data 两个进程；Data 以内存夹具提供数据，未在工作区创建或打开任何 SQLite 文件；Product 不持有 SQLite 依赖。

#### SPEC-OPS-RUNTIME-001-MODE-003

强度：Acceptance

（对应运行模式验收场景）
Given `ops runtime backend --content-source fixture --data test` 被连续启动两次
When 每次运行检查 Data 的数据库状态
Then 每次运行使用全新临时 SQLite（位于 `target/test-dbs/`、以 PID 命名）、自动完成迁移并加载稳定 seed，第二次运行不复用第一次运行的文件；正常运行结束时该文件被删除，异常退出时保留供诊断。

#### SPEC-OPS-RUNTIME-001-MODE-004

强度：Acceptance

Given `ops runtime integration --content-source fixture` 已启动
When 访问 Product 地址
Then Product 同源提供 `src/frontend/dist` 页面、静态资源与 `/api`，无需 Vite；`--watch` 下前端源码变更会更新构建产物且链路保持可诊断。

#### SPEC-OPS-RUNTIME-001-PORT-001

强度：Build

Given 任一运行模式
When 使用 `--web-port`/`--product-port`/`--data-port`/`--mock-port` 覆盖候选端口，或传入 `1023`、`65536`、`abc`
Then 覆盖值成为该服务唯一候选起点；越界与非整数值按用法错误处理且不启动任何进程；本期不存在 `--host`/`--listen`，出现即用法错误。

#### SPEC-OPS-RUNTIME-001-PORT-002

强度：Acceptance

（对应运行模式验收场景的端口冲突分支）
Given 某服务的候选端口已被无关进程占用
When 启动该模式
Then 从候选值起逐次 +1 重试（最多尝试 10 个端口，+0…+9），绑定成功后继续启动其余服务；打印的访问地址与注入给依赖方的地址均使用递增后的实际端口。

#### SPEC-OPS-RUNTIME-001-PORT-003

强度：Acceptance

Given 某服务的候选值起连续 10 个端口（+0 … +9）均被占用
When 启动该模式
Then 以退出码 `20` 和 `PORT_EXHAUSTED` 结束，诊断列出尝试过的 10 个端口，已启动的其他服务被停止并清理。

#### SPEC-OPS-RUNTIME-001-PORT-004

强度：Build

Given 同一模式需要分配多个服务端口，且递增会跨越其他服务的候选端口
When 依次分配端口
Then 分配按依赖顺序进行（Data → Product，Mock → Vite），且已分配给本次运行的端口被排除出后续候选，同一运行内不会有两个服务绑定同一端口。

#### SPEC-OPS-RUNTIME-001-PORT-005

强度：Acceptance

Given 端口递增已发生（例如 Mock 实际绑定 `9093`、Data 实际绑定 `8082`）
When 检查子进程环境与前端行为
Then Vite 的 `BLOG_API_ORIGIN` 指向 `http://127.0.0.1:9093`，Product 收到的 Data 地址指向 `http://127.0.0.1:8082`，页面请求实际到达递增后的地址。

### 环境变量与配置注入

#### SPEC-OPS-RUNTIME-001-ENV-001

强度：Acceptance

Given 调用者环境中已导出 `BLOG_API_ORIGIN=http://127.0.0.1:9999`
When 执行 `ops runtime dev`
Then ops 启动的 Vite 进程收到由 ops 计算的 Mock 实际地址，页面数据请求到达 Mock 而不是 `9999`；调用者自身的 shell 环境不被修改。

#### SPEC-OPS-RUNTIME-001-ENV-002

强度：Acceptance

Given 环境中存在任意 `SCENARIO`/`BLOG_SCENARIO` 类变量，且未传 `--scenario`
When 执行 `ops runtime dev`
Then 退出 10 并提示缺少必填参数，不自动选择 default；传入未知场景名也按用法错误处理；场景选择不读取任何环境变量或配置文件。

#### SPEC-OPS-RUNTIME-001-ENV-003

强度：Build

Given 运行配置由 ops 注入
When 审查前端页面与领域模型代码
Then Mock 专用类型、session 头名称和 ops 注入变量只出现在 composition root / Client 注入层，不出现在页面组件或领域模型。

#### SPEC-OPS-RUNTIME-001-ENV-004

强度：Build

Given Product/Data/Mock 子进程需要运行配置
When ops 启动它们
Then 模式所需的运行连接和内容来源都通过明确命名的参数或环境变量注入，标识符按本节与附录 A 命名；不得依赖子进程隐式默认值自连。管理凭证等其他已定义注入面仍由各自 Spec/指南约束。

### 进程生命周期与失败

#### SPEC-OPS-RUNTIME-001-FAIL-001

强度：Acceptance

（对应运行模式验收场景）
Given `ops runtime dev` 启动
When Vite 与 Mock 均通过就绪检查
Then `[ops]` 输出两个服务的实际地址与最终访问地址，且地址在就绪确认之后才打印；任一服务未就绪时不打印"可访问"。

#### SPEC-OPS-RUNTIME-001-FAIL-002

强度：Acceptance

（对应运行模式验收场景）
Given `ops runtime backend` 或 `ops runtime integration` 启动
When 依序执行构建（仅 integration）与启动
Then `integration` 先完成前端构建再启动 Product/Data；Data 就绪先于 Product 对外就绪；Product 在 Data 未就绪时不开始接受公开请求。

#### SPEC-OPS-RUNTIME-001-FAIL-003

强度：Acceptance

（对应运行模式验收场景）
Given 某关键服务启动失败（例如 Data 进程立即崩溃、Mock 端口绑定被拒）
When 启动该模式
Then 同模式已启动的其他进程被停止并清理，无遗留子进程，退出码 `20`，`SERVICE_START_FAILED`，日志含失败服务名与原因。

#### SPEC-OPS-RUNTIME-001-FAIL-004

强度：Acceptance

（对应运行模式验收场景）
Given `ops runtime integration` 的前端构建失败
When 启动流程进入构建阶段
Then 不启动 Product/Data 服务栈，退出码 `20`，`BUILD_FAILED`，诊断保留构建器输出。

#### SPEC-OPS-RUNTIME-001-FAIL-005

强度：Acceptance

（对应运行模式验收场景）
Given 模式已正常运行，某长驻服务子进程退出（含非零退出、被信号杀死，以及未经 ops 关停发起的 exit 0）
When 检测到子进程退出
Then 停止同模式其余进程并清理，退出码 `20`，`CHILD_EXITED`，输出含服务名、子进程退出码与该服务最近日志片段。（2026-09-06 PM 补强：exit 0 的"消失"同样是异常，服务栈不允许半活）

#### SPEC-OPS-RUNTIME-001-FAIL-006

强度：Acceptance

Given 用户在任一运行模式运行中按 Ctrl-C（SIGINT）
When ops 处理该信号
Then 信号传播到所有子进程并等待其退出，完成清理后以 `130` 退出，系统内不残留该次启动的子进程。

#### SPEC-OPS-RUNTIME-001-FAIL-007

强度：Acceptance

Given `ops runtime integration --watch` 运行中前端构建失败
When watcher 报告构建失败
Then watcher 与服务栈被停止，退出码 `20`，`BUILD_FAILED`，诊断输出保留（不因停止而被截断或吞掉）。

#### SPEC-OPS-RUNTIME-001-FAIL-008

强度：Acceptance

（对应运行模式验收场景）
Given Data 的任务通道已满
When Product 在请求内经 `try_send` 投递失败
Then Product 对该请求返回 HTTP `503`，响应体遵循 ARCH-DATA-API 的 `{ code, message, data }` envelope；Product 进程不崩溃、不退出，`ops` 不因此终止模式；该事件在日志中可辨认。

#### SPEC-OPS-RUNTIME-001-FAIL-009

强度：Acceptance

（对应运行模式验收场景）
Given 运行中的模式收到 SIGTERM 关停
When 关停顺序执行
Then 观察到"停止接受新请求 → 逐层释放通道句柄 → 限期退出"的顺序；限期为 **5s**，超限对仍未退出的进程执行 SIGKILL（2026-09-06 PM 裁定，关闭 OPEN-10）；ops 自身以 `143` 退出且不遗留子进程。

#### SPEC-OPS-RUNTIME-001-FAIL-010

强度：Acceptance

Given 未知命令、未知选项、缺少参数、非法取值或工作区未激活
When 调用本 Spec 范围内任一 ops 命令
Then 可观察行为遵循 SPEC-OPS-USABILITY-004 / SPEC-OPS-USABILITY-006（stderr 解释与纠正方式、stdout 最近帮助、快速失败不死循环），退出码为 `10`；既有用法错误码 `2` 与执行失败码 `1` 已废止（2026-09-06 用户决策，全局统一退出码）。

### 日志

#### SPEC-OPS-RUNTIME-001-LOG-001

强度：Acceptance

Given 任一模式正常运行
When 检查 ops 输出
Then 每行都带 `[web]`/`[product]`/`[data]`/`[mock]`/`[ops]` 之一，同一服务在整个运行期前缀不变，来源与实际产生日志的进程一致。

#### SPEC-OPS-RUNTIME-001-LOG-002

强度：Build

Given 子进程输出多行内容、含 stderr 错误或输出不含换行的尾行
When ops 转发
Then 逐行转发且保留行内容，stderr 内容不被丢弃，失败路径的日志足以定位服务名与原因。

### Spike（隔离，不作为验收门槛）

#### SPEC-OPS-RUNTIME-001-SPIKE-001

强度：Build（2026-09-06 Spike 完成并转为当前契约；原始观察记录不再随当前文档集保留）

Given `integration` 由 Product 挂载 `src/frontend/dist`
When 访问映射路径、未知路径、无尾斜杠目录路径、深层刷新路径与 `/assets/*`
Then 行为遵循「静态挂载路由契约」：①精确映射（`/`、`/m`、`/admin` 含无尾斜杠变体）返回 200 `text/html`，**不做 SPA 回退**——未知路径、未映射目录、深层刷新一律 404 `text/plain`；②`/healthz` 优先于静态映射；③目录穿越与反斜杠路径 404；④映射文件缺失 404 且日志含 `[product] static file missing`（可诊断）；⑤非 GET/HEAD 静态请求 405；⑥`/api/` 未知子路径 404。

**与 Go 参考实现的三处有意差异（2026-09-06 PM 裁定豁免，前端可见功能不受影响，契约测试不得按 Go 行为断言这三点）**：taxonomy 更新目标不存在时 Rust 返回 404（Go 为 409）；POST 非法 JSON 一律 400 `INVALID_PAYLOAD`；`/api/public/articles` 非 GET 方法返回 405（其余端点 400）。

#### SPEC-OPS-RUNTIME-001-SPIKE-002

强度：Spike（时间盒：半个工作日）

Given `integration --watch` 在服务运行期间重建 `src/frontend/dist`
When 重建窗口内发起页面与 `/api` 请求
Then 记录是否出现半写产物、资源 404 或新旧资源混用，以及是否有必要引入"构建完成后原子切换/暂存目录"；观察结果作为是否补充契约的输入。

## 参数契约修订（2026-09-06）

用户确认取消 ops 有值参数的默认值与环境变量补值，使用 int32 / enum / switch 字段模型；watch 与全局控制参数保持无值 switch。命令表、示例、CMD-002/003/004 与 ENV-002 已按新决策更新。以下原始决策记录保留历史背景，参数输入以 SPEC-OPS-PARAMETERS-001 和本文当前命令表为准；Rust 服务独立 CLI 的附录 A 优先级不在本次改造范围。

## 决策记录（原待决策项，2026-09-06 全部关闭）

| 编号 | 事项 | 决策（2026-09-06） | 决策者 | 状态 |
| --- | --- | --- | --- | --- |
| OPEN-1 | 用法错误顶层码 `10` 还是 `2` | 退出码全局统一为 `0`/`10`/`20`/`130`/`143`，适用于**所有** ops 命令；既有 `1`/`2` 语义废止，`SPEC-OPS-USABILITY-004` 同步修订 | 用户 | 已关闭 |
| OPEN-2 | 端口递增上限 | 每端口自候选值起最多尝试 10 个（+0…+9），耗尽返回 `PORT_EXHAUSTED` + 退出 `20` | PM | 已关闭 |
| OPEN-3 | test 库位置与命名 | `target/test-dbs/`、以 PID 命名 | PM | 已关闭 |
| OPEN-5 | test 库清理时机 | 正常退出即删，异常退出保留供诊断 | PM | 已关闭 |
| OPEN-4 | 子进程注入标识符命名与形态 | 沿用 `BLOG_` 前缀风格，具体命名记入附录 A | PM | 已关闭（附录 A 命名已回写为契约） |
| OPEN-6 | ops 自身 SIGTERM 退出码 | `143` | PM | 已关闭 |
| OPEN-7 | `integration` 是否加 `--data mock` | 不加；需要 mock 走 `dev` / `backend --data mock` | PM | 已关闭 |
| OPEN-8 | `AGENTS.md`/`operations.md` 旧条目清理 | 与当前命令面同步，列入实现依赖项 | PM | 已关闭（转为依赖项） |
| OPEN-9 | `--json` 正常启动地址清单 | 提供：模式、服务名、实际 host:port；新增场景 `CMD-009` | PM | 已关闭 |
| OPEN-10 | 关停限期与超限处理 | 限期 5s，超限对未退出进程 SIGKILL | PM | 已关闭 |

同日追认为正式契约的本 Spec 推导项：`integration` 固定 `data=test` 且不提供 `--data`；监听固定 `127.0.0.1`、不提供 `--host`/`--listen`；端口参数命名与 `1024`–`65535`（禁 `0`）；`runtime dev` 的 scenario 与端口均显式必填。

## 附录 A：注入标识符命名（2026-09-06 实现期确定，随「环境变量与配置注入」表一并视为契约）

- **形态**：一律使用环境变量（沿用 `BLOG_` 前缀风格），不使用位置/具名进程参数传递注入值。
- 命名与方向：

| 标识符 | 方向 | 值形态 | 消费方 |
| --- | --- | --- | --- |
| `BLOG_DATA_ADDR` | Data 实际地址 → Product | `http://127.0.0.1:<port>`（含 scheme，无尾随斜杠） | Product |
| `BLOG_WEB_DIR` | `src/frontend/dist` 路径 → Product | 绝对路径 | Product（`integration`） |
| `BLOG_DATABASE_PATH` | test 数据库路径 → Data | 绝对路径（ops 传 `target/test-dbs/<PID>`） | Data（仅 `test` 语义） |
| `BLOG_CONTENT_REPO` | 调用环境 → Product | `owner/repository` | Product（仅 GitHub 来源且值存在） |
| `BLOG_CONTENT_TOKEN` | 调用环境 → Product | token（不得记录） | Product（仅 GitHub 来源且值存在） |

- **优先级**：显式进程参数 > 注入的环境变量 > 内置默认值（Product：`--data-addr` / `--web-dir`；Data：`--data-database-path`）。默认值：Data 地址 `http://127.0.0.1:8081`，test 库路径 `target/test-dbs/<PID>.db`（相对当前工作目录）。
- **监听地址不是注入项**：监听走进程参数 `--listen <IP:PORT>`（固定回环地址），不设环境变量，避免与 `BLOG_LISTEN_ADDR`（已删除，不复活）混淆。子进程按 `--listen 127.0.0.1:0` 启动时，实际绑定端口以子进程日志行 `[data] listening addr=…` / `[product] listening addr=…` 为准，供 ops 读取并作为注入值的来源。
- **日志前缀**：`[data]` / `[product]`（stdout 为常规与请求日志，stderr 为失败诊断），每行一个前缀。
- 在本回写之前，`ENV-004` 与 `PORT-005` 的断言只针对"注入发生且值正确"；回写后它们同时约束上述标识符。

## 实现依赖项（非本 Spec 契约）

- `AGENTS.md`、`docs/guides/operations.md` 和实际命令实现中的旧入口必须与当前命令面保持一致；本 Spec 不保留已删除命令的兼容约定。
- 既有 ops 命令（`workspace doctor`、`quality *`、`delivery build`）的帮助文本与契约测试中退出码 `1`/`2` 需按全局统一决策改为 `10`/`20`。

## 测试/验收证据映射

| Spec 场景 | 证据 | Owner |
| --- | --- | --- |
| `CMD-001`–`CMD-009`、`PORT-001`、`PORT-004`、`ENV-001`–`ENV-004`、`LOG-001`、`LOG-002` | ops 契约测试（`apps/blog/test/**/*.test.ts`） | testing / frontend-core |
| `MODE-001`–`MODE-004`、`PORT-002`、`PORT-003`、`PORT-005`、`FAIL-001`–`FAIL-007` | ops runtime 集成测试（子进程真实启停） | testing |
| `FAIL-008`、`FAIL-009` | Rust Data/Product 测试与运行证据 | backend |
| `MODE-002`、`MODE-003` | Rust 契约/夹具测试与运行证据 | backend |
| `SPIKE-001`、`SPIKE-002` | Spike 观察记录（不作为验收门槛） | product / runtime |

## 边界与失败

- 所有原待决策项（含附录 A 注入标识符命名）均已关闭；注入标识符以“环境变量与配置注入”表与附录 A 为准。
- 任何端口参数、注入标识符、场景集合或退出码语义的变更都必须同步修订本 Spec，不得只在实现中改名。
