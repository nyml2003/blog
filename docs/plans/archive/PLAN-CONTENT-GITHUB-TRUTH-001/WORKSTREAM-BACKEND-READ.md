---
kind: workstream
id: WORKSTREAM-BACKEND-READ
status: archived
outcome: partial
archived: 2026-09-07
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: backend
owner: backend-data
depends_on:
  - WORKSTREAM-REPO-CONTRACT
  - PLAN-MOBILE-BROWSE-IA-001:data-write-set-handoff
write_set:
  - src/backend/data/src/
  - src/backend/data/migrations/
  - src/backend/data/tests/
last_reviewed: 2026-09-07
---

# 工作流：持久缓存与事务替换

## 目标

提供跨重启保留的前台缓存和推荐状态，以及按单个 main commit 原子替换内容的类型化操作。本工作流只负责 Data；Product 的 GitHub 访问、HTML 校验和启动同步由 BACKEND-WRITE 负责。

## 输入与约束

- REPO-CONTRACT 的完整快照、同步版本、时间和推荐引用协议；
- 现有 SQLite 迁移、公开查询、BFF、排序与批量关联；
- Data 不解释 HTML，不访问 GitHub；共享协议及 Cargo 依赖需求交 REPO-CONTRACT；
- 临时工作区不由前台内容表承担；用户允许丢失的临时改动不意味着可清除公开缓存。

## 交付

1. 实现 prod 持久存储：自动迁移、不加载 seed、不在停止时删除数据库/WAL；路径遵守显式参数 > BLOG_DATABASE_PATH > 无默认值，仓库外存放。
2. 保持 mock 内存和 test 临时数据库语义，不把开发测试库切成真实持久内容库。
3. 实现单事务替换文章、taxonomy 和关联，成功时同时更新 main commit/同步元数据；事务失败回滚全部内容及成功版本。
4. 同一 commit 重复导入结果一致，不用导入时钟重置文章 ID、创建/更新/首次发布时间。
5. 持久保留推荐集合；处理内容表替换与推荐外键关系，避免重建清除推荐或被外键阻塞。缺失/下架文章不对外展示，其他引用和顺序保留。
6. 公开查询只消费成功提交的快照，事务提交前后不能出现混合版本；固定查询复杂度和现有公开语义不变。
7. 一次性切换时停止旧管理内容操作对持久内容表的直接修改，防止经内部旧路径绕过快照导入；退役时点与 Product/前端集成协调。

## 验收

- Spec 001/005/013/014/017：持久数据库重启、重复导入、事务注入失败、推荐引用与下架、首次发布时间稳定。
- 以旧快照和推荐状态为基线，分别触发内容插入、关联和版本更新失败，断言事务完全回滚。
- 从空库开始自动迁移且无 seed；prod 缺路径明确失败，mock/test 生命周期回归通过。
- 既有 Data API/BFF 相关测试及 Rust fmt/clippy/test 通过；不得修改测试预期来放宽公共读契约。
- 将生产存储与迁移的实际结果交 BACKEND-WRITE/infra 更新架构和运维说明。

## 当前阻塞与记录

2026-09-07：已交付 `prod` 持久 SQLite 路径、自动迁移、不 seed、正常退出不删除及实际写入后重新打开测试。缺少路径按配置错误退出（10）。内容快照的单事务替换、同步版本和推荐引用保留仍未接入。过程中出现 fixture 数量断言失败，随后当前工作区重新执行 Data/Product/Mock 全套测试已通过；结果见 EVIDENCE.md。
