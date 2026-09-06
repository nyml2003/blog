---
kind: workstream
id: WORKSTREAM-OPS-DELIVERY
status: archived
outcome: not_implemented
archived: 2026-09-07
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: infra
owner: infra
depends_on:
  - WORKSTREAM-BACKEND-READ
  - WORKSTREAM-BACKEND-WRITE
write_set:
  - ops/src/application/runtime.ts
  - ops/src/application/runtime.test.ts
  - ops/src/application/runtime.stack.test.ts
  - ops/src/infrastructure/binaries.ts
  - docs/guides/operations.md
  - docs/architecture/infrastructure.md
last_reviewed: 2026-09-07
---

# 工作流：运行配置与交付

## 目标与边界

交付可复现的运行配置、开发来源隔离、持久缓存与故障恢复说明。手动同步只从后台触发；本工作流不新增 `ops content sync`，也不创建 timer/cron/定时重启模板。

Data prod 生命周期和 Product 来源/凭证解析分别由 BACKEND-READ/WRITE 实现；本工作流做现有 runtime 编排接入与验证，不修改其文件。协议与依赖需求交 REPO-CONTRACT 统一维护。

## 交付

1. 保持既有 ops 命令与显式参数契约；dev 使用 Mock，backend/integration 的 mock/test 显式使用隔离 fixture。环境中有真实 PAT 也不能自动连接 GitHub。
2. 记录后端 binary 的真实来源、仓库和凭证配置，PAT 限目标私有仓库的 Contents/Pull requests 读写；运行日志、错误与进程说明不回显凭证。
3. 明确两类生命周期：临时未提交改动重启可丢；前台 SQLite 缓存与推荐状态跨重启保留。prod 路径遵循现有优先级、无默认值、仓库外，不加载 seed。
4. 文档说明启动一次同步、后台手动同步、GitHub 故障时读旧缓存、PR 恢复、未提交临时变化清空和合并后同步生效。
5. 提供空仓库初始化与独立测试仓库验收步骤；测试仓库及真实来源必须显式指定，不因运行开发命令写入真实内容仓库。
6. 记录 GitHub 断连、PAT 失效、同步失败、重启恢复与缓存重建的可复现结果；首次发布时间仍从 GitHub 历史恢复。
7. 数据库备份使用 SQLite 一致性备份方法，注明未提交临时工作区不属于持久备份；推荐状态随持久库保留。
8. 按已交付实现更新运维和基础设施文档，不提前宣称 prod 或 GitHub 链路已经可用。公网 unit、TLS、域名和生产启用归独立部署工作。

## 验收

- 相关 ops 契约和 runtime 测试通过，已有命令、参数和退出码不回归。
- 测试确认 dev/mock/test 来源隔离、prod 缺路径失败且正常停止不删除数据。
- 独立测试仓库下验证启动同步、后台手动同步和 GitHub 故障后的旧缓存可读；不包含定时重启演练。
- 输出准确启动/验证命令、结果、凭证配置说明与未完成的生产部署边界；质量通过不等同公网验收。

## 当前阻塞与记录

2026-09-06：后端持久缓存与 GitHub 链路待交付。本轮仅由 PM 更新职责与写集，未创建同步命令、定时任务或部署配置。
