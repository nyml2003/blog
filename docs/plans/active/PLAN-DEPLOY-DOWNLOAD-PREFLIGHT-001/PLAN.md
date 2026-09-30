---
kind: plan
id: PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001
status: ready
owner: project-manager
created: 2026-09-30
last_reviewed: 2026-09-30
---

# 部署预检与产物下载可观测性

## 目标

让 `blog-deploy deploy`、`blog-deploy redeploy` 和 `blog-deploy self-update` 在真正下载或替换文件前，明确告诉用户当前 Release、目标资产、网络可达性、预计风险和下一步动作；下载过程中提供可理解的进度、阶段和失败原因，避免网络不稳定时只能等到超时或看到模糊错误。

本计划解决两个问题：

1. 部署提示不足，用户不知道当前处于查询、预检、下载、校验、安装还是重启阶段；
2. 下载前没有统一网络预检，无法提前发现 DNS、TLS、代理、GitHub API 或 Release 资产不可达。

不把网络预检当成绝对成功保证。预检通过后网络仍可能中断，下载器仍必须有超时、重试、断点边界、临时文件清理和校验失败处理。

## 当前基线

- `blog-deploy` 已能选择稳定 `build-v*` / `script-v*` Release，并下载资产、校验 checksum、安装或原子替换。
- `deploy` / `redeploy` 当前输出版本、资产和部分步骤，但没有统一的阶段模型、网络预检结果、下载进度或可操作的失败建议。
- `self-update` 已具备 checksum、锁、临时文件和回滚边界，但下载过程提示与业务部署不统一。
- `apps/blog` 的 ops 输出标准化计划规定了 stdout/stderr、结构化事件、错误码和 `--json`；本计划的输出必须遵循该协议，不再另造一套格式。
- GitHub Release 查询和资产下载依赖外部网络；服务器可能存在 DNS、代理、证书链、出口防火墙、限速和短暂断网问题。

## 用户可见流程

### 预检阶段

在人类模式下，开始任何大文件下载前至少显示：

- 当前命令和 dry-run 状态；
- 当前 installer 版本、目标版本、Release tag 和资产名；
- 目标架构、资产大小（如果 Release 元数据提供）和 checksum 资产；
- GitHub API、Release 元数据 URL、实际下载 URL 的脱敏地址；
- DNS 解析、TCP/TLS/HTTP 可达性结果；
- 代理/证书/超时配置来源；
- 预检结论和失败时的建议动作。

预检失败必须在下载前结束，不创建最终安装文件，不停止或重启业务服务。对于无法可靠判断的项目（例如无法提前知道完整下载时间），应显示“未验证”而不是伪造成功。

### 下载阶段

下载提示至少包含：

- 当前阶段：查询、预检、下载、校验、解包、安装、重启、健康检查；
- 已下载字节、总字节（若可得）、百分比或明确的未知总量状态；
- 最近速度、已用时间和超时/重试次数；
- 每次重试的原因、等待时间和剩余次数；
- 下载完成后进入 checksum 校验，不把 HTTP 200 当作成功；
- 失败时保留临时文件清理结果、可重试性和人工下一步。

非 TTY 或 CI 环境不使用 spinner，只输出稳定阶段事件和周期性进度；`--json` 只输出结构化 NDJSON，不混入人类进度。

## 网络预检设计

### 检查层级

按实际下载依赖分层检查，不只 ping 一个固定地址：

1. 解析 GitHub API 主机名；
2. 建立 TCP 连接并完成 TLS 握手，报告证书/代理错误；
3. 请求 Release API，验证 HTTP 状态、响应格式和目标 tag；
4. 对选定资产 URL 做轻量 HEAD 或等价范围请求，确认资产存在、Content-Length、Content-Type、重定向和可访问性；
5. 在需要时检查 checksum 资产 URL；
6. 将预检结果与实际下载使用的 URL、代理和超时配置绑定，避免检查 A 地址、下载 B 地址。

### 超时与重试

- DNS、连接、TLS、首字节和总下载分别有明确超时；不得只有一个无限等待的总 Promise。
- 只对网络瞬断、连接重置、可重试的 5xx/429 等情况重试；参数错误、404、checksum 不匹配、证书校验失败不盲目重试。
- 使用有上限的指数退避，并在提示中展示下一次重试等待时间；总耗时受上限约束。
- 默认不实现跨进程断点续传；如实现 Range，必须验证服务端响应和临时文件校验，不能把部分文件当作完整资产。
- 下载失败后清理临时文件，保留旧安装器、旧业务包和现有配置不变。

## 输出与错误协议

### 人类模式

- stdout 输出阶段、进度、成功结果和下一步；stderr 输出失败、诊断和建议。
- 统一使用 `[ops]`/部署来源和稳定阶段名称，避免命令分别拼接不同文案。
- 每个失败显示：阶段、目标、错误类别、是否可重试、建议命令或检查项。
- 不输出 token、完整请求头、cookie、私钥、完整配置或带秘密的 URL 查询参数。

### 机器模式

遵循 `PLAN-OPS-OUTPUT-STANDARD-001` 的统一事件模型，至少覆盖：

- `release_resolved`；
- `network_preflight_started` / `network_preflight_completed`；
- `download_started` / `download_progress` / `download_retry` / `download_completed`；
- `checksum_started` / `checksum_completed`；
- `install_started` / `healthcheck_completed`；
- `deployment_failed` / `deployment_completed`；
- 最终终止事件和稳定退出码。

网络预检失败和下载失败必须使用可区分的稳定错误码，便于 CI 和运维脚本判断是否稍后重试。

## 范围

### 纳入

- `apps/blog-deploy` 的 `deploy`、`redeploy`、`self-update` 下载流程；
- Release 查询、资产选择、checksum 下载和资产 HEAD/范围预检；
- 网络客户端的超时、重试、错误归类和进度事件；
- 人类模式和 `--json` 输出；
- dry-run 预检报告；
- `deploy/README.md`、`docs/guides/operations.md`、命令帮助和故障排查提示；
- 网络不稳定、DNS/TLS/HTTP 状态、限速、超时、checksum 错误和临时文件清理测试。

### 不纳入

- 不改变 Release tag、资产命名、版本选择或 checksum 的信任根；
- 不自动切换镜像源、代理或绕过 TLS 证书校验；
- 不保证预检后网络永远可用；
- 不默认引入断点续传、后台下载、自动定时部署或多源 CDN；
- 不把部署失败静默重试到无限；
- 不修改 Product/Data 业务逻辑、数据库迁移或容器拓扑。

## 成功标准

1. 三个下载型命令在真正写入安装目标前都执行统一预检，并输出版本、tag、资产、URL、网络检查和预检结论。
2. 人类模式能区分查询、网络预检、下载、校验、安装、重启和健康检查阶段；非 TTY 输出稳定且无 spinner 依赖。
3. 下载过程有进度、速度/耗时、重试原因和最终结果；总大小未知时不会显示误导性百分比。
4. DNS、TLS、HTTP 非 2xx、429/5xx、连接重置、超时和 checksum 错误分别可诊断，并有明确是否可重试的判断。
5. `--json` 输出符合统一事件协议，stdout 无人类文本；最终事件和进程退出码一致。
6. 预检失败、下载中断、校验失败和安装失败都不会破坏旧安装器、旧业务包、配置、证书或数据库；临时文件可验证清理。
7. dry-run 能完成 Release 解析和网络预检，并明确不会下载、安装、替换或重启。
8. 相关 installer 测试、网络模拟测试、bundle 冒烟、`ops quality check` 和文档检查通过；至少完成一次受限网络环境演练。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 预检与输出契约 | deploy+qa | ops 输出标准化契约 | 本计划、错误码/事件 Spec、帮助与指南 | ready |
| 网络客户端能力 | infra | 预检契约 | `apps/blog-deploy/src/installer/**`、网络测试、超时/重试/进度适配 | ready |
| 三个命令接线 | deploy | 网络客户端能力 | `deploy`/`redeploy`/`self-update` runner、临时文件和安装步骤 | ready |
| 输出消费者与文档 | qa+release | 事件模型、命令接线 | CI、运维脚本、`deploy/README.md`、operations guide、示例 | ready |
| 受限网络验收 | qa+deploy | 上述工作流 | 网络模拟、隔离服务器演练、验收记录 | ready |

网络客户端、installer runner、Release 资产协议属于共享写集，必须串行修改；网络测试可以使用独立 mock server，但不得把真实 GitHub 可达性写成必过的单元测试。

## 集成验收

1. 正常网络下执行 `deploy --dry-run`、`redeploy --dry-run`、`self-update --dry-run`，确认预检报告完整且无副作用。
2. 模拟 DNS 失败、TLS 失败、代理拒绝、Release API 404/429/5xx、资产 404、连接重置、慢响应、无 Content-Length 和 checksum 下载失败，检查提示、重试和退出码。
3. 在下载中断、进程终止、磁盘空间不足和校验失败时，确认临时文件清理、旧版本可运行、服务未被提前重启。
4. 使用非 TTY 管道和 `--json` 消费者运行，确认输出可逐行解析，没有 spinner、横幅或原始 HTTP 错误混入 stdout。
5. 在受限带宽或短暂断网环境运行一次真实 installer 演练，记录预检是否提前暴露问题、重试耗时、最终恢复和人工动作。
6. 运行 installer 测试、Release 相关测试、bundle `--help` 冒烟、`ops quality check` 和文档 `git diff --check`。

## 未决项

- 预检使用 HEAD 还是 `Range: bytes=0-0`；由 GitHub Release/CDN 实际响应和代理兼容性决定。
- 是否显示预计剩余时间；只有 Content-Length、稳定速度和采样窗口足够时才显示，否则只显示已下载/速度。
- 默认超时、重试次数、退避上限和总下载时限；需结合 2 核/2 GB 服务器网络环境和最大 Release 资产大小测定。
- 是否支持用户显式配置代理、镜像或 API endpoint；默认不自动改写目标地址。
- `--json` 进度事件频率和是否支持 `--quiet`；必须保证 CI 不因高频事件产生过量日志。
