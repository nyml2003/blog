---
kind: plan
id: PLAN-CONTAINER-DEPLOYMENT-001
status: ready
owner: project-manager
created: 2026-09-29
last_reviewed: 2026-09-29
---

# 低资源单机容器部署

## 目标

设计一套能在 2 核 CPU、2 GB 内存、40 GB 磁盘服务器上长期运行的单机容器部署方案。方案复用当前 Product、Data、前端静态产物、nginx、SQLite、Release 和 installer 的边界，重点解决资源上限、进程恢复、数据持久化、健康检查、升级回滚、备份恢复和日志诊断。

本计划先产出可审查的容器架构和迁移/验收方案，再决定是否实现 Docker/Podman 镜像与 compose 文件；不直接把现有 systemd 发布包机械地塞进容器。

## 当前基线

- 当前服务器发布包包含 Product、Data、systemd unit、nginx 模板和 checksum；installer 负责注入域名、内容仓库、token 和证书。
- Product 与 Data 是两个 Rust 进程；Product 面向浏览器和静态页面，Data 独占 SQLite；nginx 负责 HTTPS/域名和反向代理。
- 公开运行约束是单机低依赖；目标服务器为 2 核/2 GB/40 GB，SQLite 数据位于服务器持久目录，内容仓库是 GitHub 真源，数据库是投影。
- 当前生产方案使用 systemd + nginx；容器化必须保留 TLS、秘密、数据库、内容同步和健康检查的可观察语义，并提供回退到现有部署方式的路径。
- 仓库目前没有已接受的 Docker/Podman 运行契约；容器运行时、镜像发布仓库、编排文件和反向代理归属仍需决策。

## 目标拓扑候选

首轮比较两种方案，不预先假定一定拆成更多容器：

| 方案 | 组成 | 优点 | 风险/待验证 |
| --- | --- | --- | --- |
| A：应用合并镜像 + 外部代理 | Product 与 Data 同一容器由明确 supervisor/entrypoint 管理，nginx 保留宿主机 | 内存和进程数量较少，迁移接近当前 systemd | 容器内多进程恢复、日志和信号转发复杂；Data/Product 隔离变弱 |
| B：最小多容器 | Product、Data、nginx/代理分别容器化，共享只读前端和持久 Data volume | 服务边界、健康检查、单独重启和日志更清晰 | nginx 与 Rust 常驻内存、网络和部署复杂度增加；2 GB 下需实测 |

优先验证 B；若内存实测不满足，再评估 A。无论方案如何，SQLite 只能由 Data 写入，数据库 volume 不随容器删除，前端静态文件只读挂载或打入 Product 镜像，秘密不进入镜像层。

## 资源预算与可靠性边界

- 为每个服务设置明确的 CPU、内存、文件描述符和日志大小上限；预留宿主机、内核、nginx/TLS 和升级空间，不能把 2 GB 全分给应用。
- Data 的 SQLite 写入、迁移、备份和恢复必须考虑磁盘峰值；40 GB 需要定义数据库、日志、Release 镜像层、备份保留数和清理策略。
- 容器使用 `restart` 策略但不能靠无限重启掩盖配置错误；启动失败、健康检查失败和 OOM 必须可区分并进入日志/告警。
- Product 依赖 Data 就绪；健康检查要区分进程存活、Data 可用、公开 API 可读和管理端鉴权缺失，避免错误地把未配置管理凭证判为整站不可用。
- 优先单机、单副本、无 Kubernetes；不引入 Redis、Postgres、对象存储或常驻监控栈，除非资源实测和故障需求证明必要。

## 数据、秘密与网络

- SQLite 数据目录、同步状态、恢复所需元数据和备份目录使用宿主机持久卷；容器重建、镜像更新和回滚不能删除数据库。
- 内容仓库 token、管理员凭证、TOTP/恢复码和 TLS 私钥从宿主机受限文件或 secret 注入，不写入 Dockerfile、镜像、compose 公开字段、命令行和日志。
- 只有 nginx/代理对公网暴露；Product/Data 使用内部网络或回环绑定，Data 不暴露公网。管理端 `admin off/on` 语义保持现状。
- TLS 终止位置必须明确：优先复用宿主机 nginx 证书管理；若 nginx 容器化，证书目录只读挂载并定义续期/重载信号。
- 数据库备份采用应用停写或 SQLite 一致性备份方式，先备份到宿主机/外部目标，再验证可恢复；备份不是简单复制正在写入的 db 文件。

## 发布、升级与回滚

- Build Release 产物应有可追溯版本和 checksum；容器镜像是否作为新的 Release 资产，需要和现有 `build-v*` 版本策略统一，不创建第二套隐式版本。
- 升级顺序必须保证 Data schema 迁移、Product 兼容性和前端静态资产一致；明确不可逆迁移时的备份与阻断规则。
- 更新流程先拉取/验证镜像，创建备份，启动候选服务并等待健康检查，再切换代理；失败自动停止候选并保留旧版本可回退。
- 回滚必须区分“镜像回滚”和“数据库迁移回滚”；禁止把恢复旧镜像误认为能逆转已完成的 schema migration。
- 现有 installer/systemd 部署继续可用，容器部署先在隔离服务器或本地 VM 演练；迁移失败可以回到现有发布包，不要求一次切换。

## 观测与运维

- 统一输出 Product/Data/nginx 的结构化或带来源日志；定义日志轮转、压缩、保留和磁盘满时的行为。
- 提供 `/healthz`、Data readiness、公开页面 smoke 和版本/构建标识；健康检查不执行破坏性写操作。
- 记录容器重启、OOM、健康检查失败、数据库迁移、同步失败、备份成功/失败和回滚事件；敏感字段必须脱敏。
- 运维命令至少支持 status、logs、backup、restore dry-run、upgrade、rollback、config check；命令失败要有明确退出码并保证清理。

## 成功标准

1. 形成一份经审查的容器拓扑、资源预算、volume/secret/network 边界和运行时选择；明确 A/B 方案取舍及不采用 Kubernetes 的理由。
2. 在 2 核/2 GB/40 GB 约束的等价环境完成构建、启动、健康检查、公开访问、Data 重启、Product 重启、代理重启和宿主重启演练。
3. 验证数据库、内容同步状态、配置和 TLS 秘密在容器重建后保持；验证备份可恢复到独立实例，且恢复不会污染线上数据。
4. 完成一次升级、健康检查失败、OOM/资源压力、进程崩溃和回滚演练；记录恢复时间、数据损失边界和人工步骤。
5. 容器发布与现有 `build-v*`/`script-v*` Release 方向一致；不产生互相矛盾的版本和部署入口。
6. 文档、镜像/compose/installer 变更通过相关测试、镜像扫描或等价检查、配置校验和低资源运行验证；未完成的真实公网/TLS/备份目标明确列出。

## 非目标

- 不引入 Kubernetes、Swarm、服务网格或多节点高可用；
- 不把 SQLite 改成外部数据库，不改变 Product/Data 的业务边界；
- 不在本计划中重做应用鉴权、内容仓库协议或前端功能；
- 不删除现有 systemd/nginx 部署，直到容器方案完成迁移验收并有回退路径；
- 不把秘密复制到镜像、Git 仓库、Release 资产或调试 artifact；
- 不以“容器启动成功”替代数据库恢复、资源压力和真实升级回滚验收。

## 约束与依据

- `docs/FACTS.md` FACT-RUNTIME-001：目标服务器 2 核 CPU、2 GB 内存、40 GB 磁盘。
- `docs/architecture/backend.md`：Product/Data 分进程、Data 独占 SQLite、同步和健康边界。
- `docs/architecture/infrastructure.md`、`deploy/README.md`：现有 systemd/nginx、Release、installer、证书和秘密注入方式。
- `docs/specs/SPEC-OPS-RUNTIME-001.md`：进程矩阵、退出/信号、健康检查、配置注入和数据语义。
- `docs/specs/SPEC-ADMIN-AUTH-001.md`：管理鉴权模式、凭证和公网只读边界。
- `PLAN-RELEASE-ONE-CLICK-001`：Build/Script tag 和 Release 资产的一致性、不可覆盖和验收约束。
- 长期方向：根目录 `scripts/` 已删除（PLAN-SCRIPTS-REMOVAL-001）；容器构建、发布和验收能力必须落入明确的 app/CLI/CI 归属，不以新增脚本目录逃避边界。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 容器运行时与拓扑决策 | infra+backend+pm | - | 本计划、架构决策记录、资源预算 | ready |
| 镜像与进程生命周期 | infra | 拓扑决策 | `deploy/container/**` 或明确的新归属、Dockerfile/Containerfile、entrypoint、健康检查 | ready |
| 数据卷、备份与恢复 | backend+deploy | 拓扑决策 | 备份/恢复命令、Data 配置、运维文档和恢复测试 | ready |
| Release 与升级回滚 | release+infra | 镜像与生命周期 | workflow、镜像 tag/checksum、升级/回滚流程、installer 适配 | ready |
| 低资源与故障验收 | qa+deploy | 上述工作流 | 压力/故障脚本或测试工具、验收记录；不新增长期根目录 scripts | ready |

各工作流涉及 Dockerfile、compose、Release 和 installer 的共享写集时必须串行；先完成拓扑决策，再实现镜像或修改现有部署入口。

## 集成验收

1. 在等价 2C/2G/40G 主机或受限 VM 上启动全栈，检查实际 RSS、CPU、磁盘和日志增长；记录峰值而非只记录启动瞬间。
2. 模拟 Product/Data/代理异常退出、健康检查失败、网络短断、GitHub 同步失败、磁盘接近满和容器重建，确认恢复动作及数据状态。
3. 执行一致性备份、独立恢复、版本升级、失败回滚和旧 systemd 部署回退；对数据库迁移不可逆情况单独记录。
4. 运行相关 Rust/TypeScript/CLI 测试、镜像构建和配置校验；必要时运行 E2E 公开旅程，确认同源页面与 API 行为不变。
5. 计划收尾记录实际支持的容器运行时、部署入口、未完成的公网/TLS/监控工作，以及从现有部署迁移所需条件；允许以 `partial` 收尾。

## 未决项

- 采用 Docker Engine、rootless Podman，还是仅生成 OCI 镜像并由宿主现有运行时执行；以目标服务器可用性、root 权限和运维成本决定。
- 采用 Product/Data/nginx 三容器，还是 Product+Data 合并容器、nginx 保留宿主；以低资源实测和故障隔离决定。
- 容器镜像由 GitHub Actions 发布到 registry，还是继续把 tarball 作为唯一 Release 资产并在服务器本地导入；需与一键发布 Plan 统一。
- TLS 继续由宿主 nginx 管理，还是 nginx 一并容器化；需结合证书续期和回滚复杂度决定。
- 容器化是否作为现有 systemd 部署的替代入口，还是长期保留双轨；迁移演练后决定。
