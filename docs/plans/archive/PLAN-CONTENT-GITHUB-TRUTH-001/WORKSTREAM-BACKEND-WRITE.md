---
kind: workstream
id: WORKSTREAM-BACKEND-WRITE
status: archived
outcome: partial
archived: 2026-09-07
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: backend
owner: backend-product
depends_on:
  - WORKSTREAM-REPO-CONTRACT
  - WORKSTREAM-BACKEND-READ
  - PLAN-MOBILE-BROWSE-IA-001:product-mock-write-set-handoff
write_set:
  - src/backend/product/src/main.rs
  - src/backend/product/src/cli.rs
  - src/backend/product/src/http.rs
  - src/backend/product/src/data_client.rs
  - src/backend/product/src/logging.rs
  - src/backend/product/src/static_files.rs
  - src/backend/product/src/github/
  - src/backend/product/src/content_workspace/
  - src/backend/product/src/content_sync/
  - src/backend/product/tests/
  - src/backend/mock/src/
  - src/backend/mock/tests/
  - docs/architecture/backend.md
  - docs/architecture/data-and-api.md
last_reviewed: 2026-09-07
---

# 工作流：临时工作区、GitHub 与同步

## 目标与边界

实现后台临时保存、服务器全局单分支整批提交、PR 恢复、启动/手动同步和前台缓存切换。Product 不直接访问 SQLite，契约模块/共享协议/Cargo 依赖由 REPO-CONTRACT 维护，Data 事务由 BACKEND-READ 交付。

## 工作区与写入

1. 临时工作区使用独立存储，普通保存不访问 GitHub，不更新前台；文章/taxonomy/下架共享同一版本化工作区。
2. 保存时服务器校验正文及输入，非法内容拒绝并返回定位诊断；不接受客户端声明的 valid 或时间字段。编辑器原始输入由前端保留。
3. 读取接口同时支持已同步文章与工作区文章，使新建、继续编辑、分类维护、下架及 PR 恢复后的管理流程完整。
4. 整批提交固定工作区版本并校验最终文件树，包括新增 taxonomy 引用；只提交全部已保存变化，不逐篇提 PR、不跳过错误项。
5. 通过 Git blobs/tree/commit/ref 写一个批次提交，更新一个活跃工作分支和 PR；不得对每个文件独立提交导致半批可见。
6. 提交写锁/版本检查阻止多页面覆盖；commit 和 PR 创建不是远程原子事务，必须覆盖部分完成、超时确认、重复请求及重启恢复。
7. 已有 PR 开放期间继续保存仍只改变临时区；再次提交更新原 PR，不自行 merge，不强制覆盖未知远程改动。
8. 提供状态查询和经确认的放弃操作；未合并 PR 关闭成功后才清空临时区。合并已经发生时返回状态变化并保留内容，不能假称撤销发布。

## 同步与恢复

1. 启动时执行一次同步，后台手动入口复用相同协调器；无 timer、cron、后台轮询、webhook、定时重启或 ops 同步命令。
2. 固定 main commit 后读取完整内容及必要历史，由共享契约/HTML core 验证，再调用 Data 事务替换。首次发布时间从首次合入历史确定，无法确定则本次同步失败，不伪造时间。
3. 重建失败继续服务旧缓存，GitHub/PAT 失败不让进程拒启；同步中公共请求继续读取最后成功快照。
4. 启动恢复已提交分支/PR，包括待补建 PR 的分支；未提交临时变化可清空。未知分支状态禁止另开批次，多个候选返回错误，不删除远程内容。
5. 普通同步不清空工作区；PR 合并后只有同步成功才结束旧批次。相对于最近一次提交的新改动保留到下一批；若不能安全保留则返回冲突，保留工作区。
6. 同步单实例、幂等，状态显示最近成功 commit、数量和失败原因；重试先确认远程结果，凭证和 GitHub 原始敏感响应不得泄漏。

## 鉴权、Mock 与切换

- 所有管理读取/保存/提交/放弃/同步接入独立登录能力。可在隔离测试中实现业务逻辑，真实管理入口须在鉴权交付后启用；本工作流不实现登录。
- 使用明确的 fixture/GitHub 来源模式，不依据 PAT 存在与否隐式连接；Mock Product 对齐新管理契约和失败场景。
- 与 Data、客户端和后台同时退役旧保存/发布/取消发布/taxonomy 写入口，不保留绕过 PR 的兼容路径。
- 当前架构只在对应实现和证据交付后更新；Spec 与计划的证据交 PM 回填。

## 验收与当前阻塞

- Spec 002/003/006/009/010/011/012/014/015/016/018/019/020 的 Product/Mock 契约及故障注入测试；直接调用服务端也不能绕过校验和鉴权。
- 断言保存零 GitHub 写入、整批一个 commit、单活跃分支、更新原 PR、永不调用 merge、提交失败无重复副作用。
- 真实测试仓库人工验证整批提交、更新 PR、合并、同步与重启；不得以 fixture 成功替代。
- 2026-09-07：已交付 Product 非法 HTML 保存门禁、仓库快照契约、服务器临时工作区核心、显式 Mock GitHub 边界和单实例同步状态测试。真实 GitHub transport、认证 HTTP、Data 快照应用、启动/手动入口及恢复流程仍待实现；未启用任何 GitHub 写入。
