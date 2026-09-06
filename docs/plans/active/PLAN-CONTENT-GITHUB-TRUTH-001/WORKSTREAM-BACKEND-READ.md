---
kind: workstream
id: WORKSTREAM-BACKEND-READ
status: ready
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: backend
owner: backend
depends_on:
  - WORKSTREAM-REPO-CONTRACT
write_set:
  - src/backend/data/src/store/sqlite.rs
  - src/backend/data/src/store/
  - src/backend/product/src/http.rs
  - src/backend/product/src/static_files.rs
  - src/backend/product/src/
  - src/backend/product/tests/
  - src/backend/mock/
  - docs/architecture/data-and-api.md
  - docs/specs/SPEC-CONTENT-GITHUB-TRUTH-001.md
last_reviewed: 2026-09-06
---

# 工作流：后端读路径（启动导入 + 图片缓存代理）

## 目标

实现 Spec 场景 001 / 004 / 005 / 006 的读侧：服务启动时 pull `main` → 解析 → 事务性全量重建 SQLite 内容表（保留派生状态）；图片缓存代理端点；PAT 缺失 / GitHub 宕机的 fail-safe。

## 输入

- REPO-CONTRACT 产物：解析器与契约；
- 现有 Data 层：SQLite 查询 / 迁移框架（读路径保留，写路径的文章表重建逻辑新增）；
- `FACT-RUNTIME-001`（单机 2C2G：全量重建与图片缓存的资源边界）。

## 输出

- **启动导入**：pull（浅克隆 / archive 下载择优）→ 解析 → 单事务重建文章与 taxonomy 表；幂等；失败回滚并沿用旧缓存 + 结构化告警；服务不拒启；
- **派生状态隔离**：推荐位等派生表与内容表分离，重建不触碰；
- **图片缓存代理**：`GET /assets/<...>` → 磁盘缓存命中即返；未命中经 PAT 回源 release 资产、落盘、响应；回源失败返回既定错误（不阻塞其他路径）；缓存目录在仓库外、可配置；
- **静态路由**：`/assets/` 路由接入现有 router（与页面、`/api` 并列）；
- mock 场景对等行为（dev 形态按 REPO-CONTRACT 审定结论）；
- `docs/architecture/data-and-api.md` 重写真源与同步模型。

## 实施任务

1. 启动导入 + 事务重建 + 幂等测试；
2. 派生状态隔离改造；
3. 图片缓存代理 + 磁盘缓存管理；
4. fail-safe（无 token / 回源失败 / 导入失败）与告警；
5. 架构文档更新、Spec 证据回填。

## 测试/验收

- Rust 测试：幂等、回滚、缓存命中 / 回源 / 失败三分支、无 token 行为；
- 人工：真实仓库启动导入走查、GitHub 断连演练（旧缓存继续服务）、磁盘缓存增长检查。

## 阻塞

无（依赖契约冻结后即可开工）。

## 交付记录
