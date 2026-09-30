---
kind: plan
id: PLAN-BLOG-DEPLOY-SELF-UPDATE-001
status: partial
owner: project-manager
created: 2026-09-29
last_reviewed: 2026-09-29
---

# blog-deploy 自更新

## 目标

让服务器上的 `/etc/blog/blog-deploy.mjs` 可以安全地从最新稳定 `script-v*` Release 获取新版本并更新自身。更新器只替换安装器文件，不自动更新 Product/Data、不重启服务、不修改 `blog.json` 或证书。

## 当前基线

- `script-v*` Release 当前发布单个 `blog-deploy.mjs`；`build-v*` 发布服务器运行包，两者职责分开。
- `blog-deploy` 已有 GitHub Release 查询、稳定 Build 版本选择、HTTP 下载、临时目录清理和 installer bundle `--help` 冒烟，但只在首次安装时由用户手工下载脚本。
- `redeploy` 会更新业务运行包并重启 Product/Data；它不应顺便替换自身，避免正在执行的脚本被覆盖后出现不可预测行为。
- 当前安装器文件位于 `/etc/blog/blog-deploy.mjs`，目录权限为 `0700`，文件应由 root 管理；配置和秘密位于同目录或 `/var/lib/blog`，不能被自更新流程覆盖。

## 目标流程

```text
读取当前安装器路径与版本信息
  → 查询最新稳定 script-v* Release
  → 若已是最新则退出 0
  → 下载到同目录临时文件
  → 校验资产名称、大小、内容格式和 checksum/signature
  → 保留旧文件备份
  → 原子 rename 替换 blog-deploy.mjs
  → 校验新文件可被 Node 解析并可执行 --help
  → 成功保留新文件，失败恢复旧文件
```

自更新命令可以叫 `self-update`，也可以采用 `update-installer`；命令名、版本来源和兼容参数在实现前固定，不能让 `deploy`/`redeploy` 隐式触发。

## 安全与可靠性边界

- 只接受严格匹配的稳定 `script-vMAJOR.MINOR.PATCH` Release；忽略 draft、prerelease、非 script tag 和不符合版本规则的资产。
- 下载必须使用临时文件，文件权限从创建时限制为 `0600`；校验未通过前不触碰当前安装器。
- 优先让 Release 提供独立 checksum；若当前 script Release 没有 checksum，先补齐发布 workflow，再开放自动替换。不能仅凭文件名或 HTTP 200 信任脚本。
- 使用锁文件或等价互斥，防止两个自更新/部署进程同时替换安装器；锁文件不能包含 token。
- 替换使用同一文件系统内的原子 rename；保留一个带版本/时间的旧副本或可恢复临时副本，并限制备份数量，避免 40 GB 磁盘增长。
- 替换后执行 `node <path> --help` 或等价语法/启动检查；检查失败立即恢复旧文件。当前运行中的 Node 进程继续执行旧代码，下一次命令使用新文件。
- 自更新不读取或重写 `blog.json`、证书、`product.env`、数据库和 Web 产物；日志不得输出 token、完整配置或下载响应内容。
- 网络失败、Release 不存在、校验失败、权限不足和恢复失败分别返回可诊断错误码；恢复失败必须明确提示人工保留的备份路径。

## 版本与兼容

- 在单文件 bundle 中嵌入 installer 版本，或从发布元数据读取当前版本；不能通过当前文件路径猜版本。
- 新版 installer 必须继续识别现有 `init`、`deploy`、`redeploy` 和配置格式；配置 schema 变更不得由 self-update 静默完成。
- `script-v*` 的资产命名、checksum、Release body 和 GitHub API 查询契约固定后，更新器和发布 workflow 共用测试。
- 首次安装仍可用 curl 下载指定 `script-v*`；self-update 失败不能阻断现有安装器继续执行其他命令。

## 成功标准

1. 新增显式 self-update 命令，支持 dry-run、已是最新、下载失败、校验失败、权限不足、并发锁和回滚路径；不影响现有命令参数与退出码。
2. `script-v*` Release 提供可验证的 checksum 或等价签名；更新器拒绝篡改、截断、错误架构或错误资产。
3. 更新成功后新文件可执行 `--help`，旧的 `blog.json`、证书、权限和业务服务保持不变；更新过程不重启 Product/Data/nginx。
4. 更新中断、磁盘空间不足或新脚本无法启动时，旧安装器仍可运行；连续执行两次不会重复下载或破坏备份。
5. 完成一次隔离服务器或临时目录演练，记录当前版本 → 新版本、失败恢复和人工回退证据；真实生产更新另行授权。

## 非目标

- 不在本计划实现自动定时升级；systemd timer/cron 另立计划；
- 不让 self-update 自动执行 `redeploy` 或更新 Build 资产；
- 不支持远程任意 URL、任意分支、prerelease 或 tag 覆盖；
- 不把 Node、GitHub token 或 installer 依赖打包进服务器配置；
- 不删除根目录 `scripts/`；实现应归入 `apps/blog-deploy` 和发布 workflow，符合最终删除 `scripts/` 的方向。

## 约束与依据

- `apps/blog-deploy/src/installer/main.ts`、`registry.ts`、`release.ts`、`version.ts`：现有 installer 命令、Release 查询和版本解析。
- `.github/workflows/script-release.yml`、`deploy/README.md`：当前 Script Release 和首次下载流程。
- `docs/plans/active/PLAN-RELEASE-ONE-CLICK-001/PLAN.md`：tag、Release 资产、不可覆盖和发布验收边界。
- `docs/FACTS.md` FACT-RUNTIME-001：2 核/2 GB/40 GB，备份和临时文件必须有磁盘上限。
- 变更安全：不覆盖秘密、不做破坏性替换、不擅自执行生产服务器操作；测试优先使用临时安装器路径。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 自更新协议与版本决策 | release+pm | - | 本计划、Release 资产/版本契约 | completed |
| Script Release 校验资产 | release+ci | 协议决策 | `.github/workflows/script-release.yml`、发布测试和资产说明 | completed |
| Installer self-update 实现 | release | 协议决策、校验资产 | `apps/blog-deploy/src/installer/**`、installer 测试和 bundle 冒烟 | completed |
| 隔离演练与文档 | deploy+qa | 实现完成 | `deploy/README.md`、`docs/guides/operations.md`、演练记录 | completed |

Release workflow 和 installer 的共享资产契约必须串行修改；self-update 不与业务 `redeploy` 写集混合。

## 集成验收

1. 用临时安装器路径模拟旧版本，更新到新 script Release；验证文件权限、inode 原子切换、`--help`、配置和证书不变。
2. 注入截断下载、错误 checksum、权限拒绝、并发执行、磁盘不足和新脚本语法错误，确认旧版本可继续运行或给出明确人工恢复路径。
3. 验证 self-update 不启动、不停止、不重启 Product/Data/nginx，不修改数据库和 Web 目录。
4. 运行 `apps/blog-deploy` 测试、bundle 构建、installer `--help` 冒烟和相关质量检查；真实 Release/服务器演练单独记录。
5. 计划收尾记录已支持的版本范围、备份保留策略、未完成的签名/生产验证和后续定时升级条件；允许以 `partial` 收尾。

## 未决项

- 当前 Script Release 是增加 `SHA256SUMS`，还是采用 GitHub artifact digest/签名；优先选择服务器无需秘密即可验证的方案。
- 当前安装器版本写入 bundle 的位置和格式；需要与 Release tag 严格一致还是允许同一 tag 重打包，必须明确禁止后者。
- 旧安装器备份保留一个还是按数量/磁盘上限保留多个；默认只保留最近一个可回退版本。
- self-update 是否支持指定版本 dry-run/回退；默认只追踪最新稳定 script Release，不提供远程降级。

## 当前收尾记录

- 已交付：`self-update` 显式命令；严格 `script-vMAJOR.MINOR.PATCH` 选择；`blog-deploy.mjs` 与 `SHA256SUMS` 独立下载和校验；同目录锁、临时文件、原子替换、单备份保留和 `--help` 失败回滚。
- 已交付：Script Release workflow 生成并发布 `SHA256SUMS`，并要求 tag 版本等于 `apps/blog-deploy/package.json` 版本；部署文档已改为 self-update 流程。
- 已验证：`pnpm --filter @blog/blog-deploy test`（8 项通过）、`ops delivery installer`（bundle 与 `--help` 通过）、`ops quality check`（Rust、TypeScript、前端、契约和构建检查通过）、`git diff --check`、Release 模块加载；测试覆盖稳定版本筛选、draft/prerelease 忽略、资产缺失、checksum 篡改和 self-update dry-run。
- 已演练：在临时目录模拟 root，使用当前 bundle 和 fake `script-v9.9.9` Release 完成真实下载、checksum、替换、`--help` 检查和旧文件备份；结果为 `isolated self-update ok 0`，配置目录外无副作用。
- 未交付：未连接真实 GitHub Release，未在隔离服务器执行权限拒绝以外的并发、磁盘不足和真实回滚演练。这些证据需要 CI 或具备 Node/root/systemd 的隔离环境，不能由本地模拟替代。
- 后续条件：完成一次隔离服务器演练并保留版本切换、失败回滚和配置/证书不变的记录后，可将本计划状态改为 `completed`；定时自更新另立计划。
