---
kind: guide
id: GUIDE-OPERATIONS
status: current
owner: operations
last_reviewed: 2026-09-29
---

# 开发与运维指南

优先使用项目本地 Flake 和 `ops`，不依赖机器上的同名全局命令。

进入项目目录后，`direnv` 会注入绑定当前项目根的 `ops`。同一项目从根目录、子目录或重新加载的环境调用时，命令 registry 保持一致；未激活项目环境时不得回退到其他仓库的同名命令。

常用入口：

```text
nix develop ./nix
ops workspace doctor
ops quality check
ops delivery build
ops release script --dry-run
ops release build --yes
ops release both --yes
ops runtime dev --scenario default --web-port 5173 --mock-port 9090
ops runtime backend --content-source fixture --data mock --product-port 8080 --data-port 8081
ops runtime backend --content-source github --data prod --database-path ~/.local/state/blog/prod.db --product-port 18080 --data-port 18081
ops runtime integration --content-source fixture --product-port 8080 --data-port 8081
ops e2e --mode integration --playwright-module playwright-core/index.mjs --chromium-path /nix/store/.../chromium
ops e2e --mode dev --scenario empty --playwright-module playwright-core/index.mjs --chromium-path /nix/store/.../chromium
ops admin credentials init
ops admin recovery regenerate
BLOG_CONTENT_REPO=owner/repository BLOG_CONTENT_TOKEN=... ops content repository init
```

帮助入口等价：`ops help <path>`、`ops <path> --help` 和 `ops <path> help`。直接运行已知分组（例如 `ops quality`）会展示该分组帮助。

## 运行模式

| 命令 | 进程 | 数据来源 | 页面入口 |
| --- | --- | --- | --- |
| `ops runtime dev --scenario <NAME> --web-port <PORT> --mock-port <PORT>` | Vite dev + Mock Product API | Mock（`default`/`empty`/`slow`/`server-error`/`malformed-response`） | Vite 实际绑定地址 |
| `ops runtime backend --content-source <fixture\|github> --data <mock\|test\|prod> [--database-path <PATH>] --product-port <PORT> --data-port <PORT>` | Rust Product API-only + Rust Data | Data 为 `mock`（内存夹具）、`test`（临时 SQLite）或 `prod`（显式路径 SQLite，必须提供 `--database-path`，自动迁移、不加载 seed、退出不删除） | 无，API 基址即 Product 地址 |
| `ops runtime integration --content-source <fixture\|github> --product-port <PORT> --data-port <PORT> [--watch]` | 先构建 `src/frontend/dist`，再启动 Rust Product（挂载 `src/frontend/dist`）+ Rust Data(test) | Data 固定为 `test`；内容来源单独显式选择 | Product 地址，页面与 `/api` 同源 |
| `ops delivery build` | 无（只构建 `src/frontend/dist` 与 Rust Product/Data/Mock binary） | — | — |
| `ops e2e --mode integration` | Ops 启动隔离的 integration 栈并在同一进程内执行 Playwright | fixture + Data(test) | Product 页面与 `/api` 同源 |
| `ops e2e --mode dev --scenario <NAME>` | Ops 启动隔离的 Vite + Mock 栈并在同一进程内执行 Playwright | Mock 命名场景 | Vite 实际绑定地址 |
| `ops perf mobile --mode integration` | Ops 启动隔离的 integration 栈并对 Mobile 公开页做 Playwright 性能采样 | fixture + Data(test) | Product 页面与 `/api` 同源 |
| `ops perf mobile --origin <URL>` | 无（直接度量既有入口，如线上站点） | 被度量站点自身 | `--origin` 提供的 URL |

约定：

- 参数契约见 [SPEC-OPS-PARAMETERS-001](../specs/SPEC-OPS-PARAMETERS-001.md)。有值参数必填且不得重复，禁止环境变量补值；帮助列出全部枚举与范围。`default` 只是需要显式选择的场景名称。
- `--watch`、`--check`、`--help`、`--dry-run`、`--json` 为 switch：出现 true，缺省 false，重复幂等，不接受 `=true`/`=false`。`ops quality format` 写入，`ops quality format --check` 只检查；dry-run 仍须完整参数。
- `ops e2e` 必须显式选择 `--mode`、`--playwright-module` 和 `--chromium-path`；`integration` 不接受 `--scenario`，`dev` 必须显式选择一个 Mock 场景。浏览器依赖不从环境变量补值；运行环境必须允许启动 Chromium 子进程和临时用户目录。
- E2E 不属于 `ops quality check`；运行产物写入 `target/e2e/<run-id>/`，包含截图、`report.json` 以及页面 console/pageerror 诊断。`report.json` 会记录模式、场景、入口、最终状态和错误摘要。
- `ops perf mobile` 与 `ops e2e` 共用 `--playwright-module`/`--chromium-path` 契约，但必须且只能在 `--mode integration`（自建隔离栈）与 `--origin <URL>`（度量既有入口，如线上站点）之间二选一。采样旅程为 Mobile 冷加载与底栏切换，按 `unthrottled`/`slow4g`/`slow3g` 网络档位（`--profile` 可单选，默认全跑）重复 `--runs` 次（默认 3），指标含切换到壳/内容可见耗时、FCP/LCP、静态资源传输字节、缓存命中数，以及 JS/CSS 解码体积的复用字节与复用率。产物写入 `target/e2e/<run-id>/perf-report.json`（`kind: "perf"`）；同一指标建议先记录基线再对比优化，线上验收用 `--origin` 跑真实部署。

- 端口候选必须由对应 `--web-port`/`--product-port`/`--data-port`/`--mock-port`（十进制 int32，`1024`–`65535`）显式提供，无默认值；被占用时从候选值起逐次 +1（最多尝试 10 个端口），实际绑定结果即注入给依赖方的地址。
- 监听地址固定 `127.0.0.1`，不提供 `--host`/`--listen`；`--scenario` 只接受命名场景，通过 CLI 传入，不读取环境变量。
- `--content-source fixture` 使用隔离的本地内容夹具，不读取也不向 Product 传递环境中的 GitHub 仓库或 token。`--content-source github` 只显式选择来源；ops 仅把实际存在的 `BLOG_CONTENT_REPO=owner/repository` 和 `BLOG_CONTENT_TOKEN` 注入 Product。缺失或无效凭证时 Product 仍从 Data 的 last-good 快照启动，远程管理操作明确失败，公开读取继续可用。token 单独存在不会切换来源。
- 新私有内容仓库使用 `ops content repository init` 显式初始化。该命令要求同时提供 repo 与 token，只创建合法空 `taxonomy.json` 和 `main`，不创建样例文章；对已经处于合法空状态的仓库幂等成功，对非空或不兼容仓库拒绝。
- ops 启动的 build、Data、Mock、fixture Product 和其他 helper 会清除调用 shell 中所有 ambient `BLOG_*` 变量；GitHub Product 与内容仓库初始化 helper 只接收命令为其显式构造的 repo/token 环境。
- GitHub 模式在 Product 启动时尝试一次同步。远端暂时不可用时服务仍使用 Data 中最后一次成功导入的快照；管理写操作保持失败关闭，状态接口记录同步错误。生产 API 地址固定为 GitHub HTTPS，测试用 loopback HTTP 地址没有运行时配置入口。
- 日志每行带来源前缀 `[web]`/`[product]`/`[data]`/`[mock]`/`[ops]`；`[ops]` 的错误与失败摘要输出到 stderr。
- 顶层退出码全局统一：`0` 成功、`10` 用法/配置错误、`20` 执行失败（端口耗尽、服务启动失败、构建失败或子进程退出）、`130` SIGINT、`143` SIGTERM。运行中的模式没有 `0` 退出路径：正常停止只能通过信号（130/143）；任一服务子进程在运行态自行退出——含 `exit 0`——都算 `CHILD_EXITED`/`20` 并停止其余服务。Ctrl-C 会传播到所有子进程并等待退出（限期 5s，超限 SIGKILL）。
- `--dry-run` 只打印将启动的进程、候选端口与构建步骤，无副作用；`--json` 的 stdout 使用统一 NDJSON 事件（每行一个 JSON 对象），包括帮助、参数错误、服务地址、dry-run、子进程行和最终终止结果。机器消费者把最后一个 JSON 对象视为最终结果，并按 `schemaVersion/event/command/code/exitCode/message` 解析；日志事件额外保留 `source/channel`。人类模式才渲染成文本并分别使用 stdout/stderr。
- ops 内部命令结果使用结构化 `Result`，输出通过统一事件端口交给终端或 NDJSON 适配器；JSON runtime 事件带 `schemaVersion`、`event`、`code`、`exitCode` 和 `message`。埋点事件默认不进入终端输出，后续可接入独立收集器。

## 发布

`ops release` 是唯一的发布入口。它只允许在 `main` 分支、干净工作树上运行，并按发布类型读取已有 tag 后自动递增 patch 版本：`script` 和 `build` 各自维护版本序列，`both` 使用同一提交但不要求两个版本号相同。

先用 dry-run 查看提交、远程仓库和将创建的 tag：

```text
ops release script --dry-run
ops release build --dry-run
ops release both --dry-run
```

确认输出无误后，添加 `--yes` 才会创建并推送 tag：

```text
ops release script --yes
ops release build --yes
ops release both --yes
```

命令不会覆盖已有 tag、不会修改服务器，也不会把 GitHub Actions 的异步结果当作本地成功；推送后需按输出的 workflow 地址检查 Release 资产、checksum、安装器 `--help` 和发布包清单。服务器更新仍单独执行 `redeploy` 并人工确认。

## 服务器部署与网络预检

服务器上的 `blog-deploy.mjs` 在 `deploy` / `redeploy` / `self-update` 下载或替换文件前执行统一网络预检（DNS → TCP → TLS → Release API → 资产可达），失败即终止并给出建议动作；下载带进度、分档超时与有限重试，下载后强制 SHA256SUMS 校验。加 `--dry-run` 只出预检报告，`--json` 输出 NDJSON 事件流与稳定错误码。排障入口与行为细节见 `deploy/README.md` 的"网络预检与下载行为"一节；常见网络故障（DNS 失败、TLS 证书、限流 429、资产 404）按预检结论的分类处理，`PREFLIGHT_FAILED` / `DOWNLOAD_FAILED` 带 `retryable=true` 时可稍后原样重试，`CHECKSUM_MISMATCH` 不要盲目重试。

## 管理端凭证

首次启用管理端前运行 `ops admin credentials init`。该命令只允许在 stdin、stdout 和 stderr 都连接到 TTY 时运行，并在读取任何凭证或创建状态前拒绝管道与重定向；它会隐藏输入并确认密码，生成 Argon2id 密码哈希、TOTP secret 和 10 张一次性恢复码。密码和验证码不会进入进程参数或 ops 日志。TOTP secret 与恢复码只显示一次，应在当前终端完成验证器录入并把恢复码存入独立的安全位置。

凭证默认位于 `${XDG_STATE_HOME}/blog/admin-auth`；未设置 `XDG_STATE_HOME` 时使用 `${HOME}/.local/state/blog/admin-auth`。目录必须由当前用户拥有且权限严格为 `0700`，`credentials.env`、恢复码状态、TOTP 重放状态及锁文件必须由当前用户拥有且权限严格为 `0600`。符号链接、错误 owner、宽松权限、未知字段和超过 8 KiB 的凭证文件都会阻止 Product 启动管理鉴权。不要手工复制、编辑或放宽这些文件的权限。

`ops runtime backend` 和 `ops runtime integration` 只向 Product 注入经检查的三项管理凭证；Data、Mock、Vite 和其他 helper 不接收这些值。凭证文件不存在时 Product 仍会提供健康检查、公开 API 和公共页面，但登录返回 `ADMIN_AUTH_UNAVAILABLE`，其他管理 API 失败关闭。Mock 由 `ops runtime dev` 显式传入 `--admin-auth bypass`，该直通模式不会用于 Product 或 integration。

登录会话只保存在 Product 内存中，最多 128 个，12 小时滑动过期；Product 重启会让全部会话失效。登录失败按已验证的客户端 IP 限制为 5 次/15 分钟。TOTP 接受当前 30 秒窗口及相邻窗口，已使用窗口持久记录以防进程重启后重放。恢复码登录成功后立即原子作废；TOTP 设备或恢复码遗失时，在服务器 TTY 运行 `ops admin recovery regenerate`，输入当前密码后重新生成整组恢复码。

Product 直接监听的是 HTTP，因此只有受信反向代理传来的 HTTPS 信息才能设置 `Secure` Cookie。部署层可用 `BLOG_TRUSTED_PROXY_IPS` 配置逗号分隔的精确代理 IP；Product 仅在 socket peer 命中该集合、`X-Forwarded-For` 是单一合法 IP 且 `X-Forwarded-Proto` 是 `http` 或 `https` 时采用转发信息。不要把普通客户端地址或宽泛网段配置为可信代理。公网使用前必须由部署层提供 TLS；应用层鉴权不提供链路加密。

## 已删除命令

`ops runtime serve` 与 `ops database migrate` 已删除，不保留兼容别名：

- 原 `serve`（构建前端后由单一服务提供页面、静态资源和 API）改用 `ops runtime integration`：同样是"先构建 `src/frontend/dist`、后端挂载、不启动 Vite"，但后端是 Rust Product + Rust Data(test) 两个进程，且不再提供 `--listen`。
- 独立迁移命令不再存在：迁移由 Data Server 启动时自动执行（`sqlx::migrate!()`）。需要"只迁移"时，用 `ops runtime backend` 或 `ops runtime integration` 启动栈并等待 Data 就绪。

开发环境和生产运行都应考虑 [FACT-RUNTIME-001](../FACTS.md) 的 2 核、2G、40G 约束。公网部署仍须在应用层鉴权之外配置 TLS、进程凭证来源和网络边界。
