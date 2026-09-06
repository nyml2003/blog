---
kind: workstream
id: WORKSTREAM-BACKEND-WRITE
status: ready
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: backend
owner: backend
depends_on:
  - WORKSTREAM-REPO-CONTRACT
write_set:
  - src/backend/product/src/http.rs
  - src/backend/product/src/github/
  - src/backend/product/src/
  - src/backend/product/tests/
  - src/backend/mock/
  - src/core/protocol/src/operation.rs
  - src/core/protocol/src/scene.rs
  - docs/architecture/data-and-api.md
  - docs/specs/SPEC-CONTENT-GITHUB-TRUTH-001.md
last_reviewed: 2026-09-06
---

# 工作流：后端写路径（分支 / PR / 上传 / 手动同步）

## 目标

实现 Spec 场景 002 / 003 / 006 的写侧：GitHub API 封装（feature 分支 commit、创建 PR、上传 release 资产）、对应管理 API 场景、手动同步触发端点。**服务器任何路径不得自动 merge。**

## 输入

- REPO-CONTRACT 产物：仓库布局与 frontmatter（写侧生成文件须同构）；
- 现有管理 API 场景命名（`sceneCode = 端点.场景`）与 `DataOperation` 协议；
- 凭证注入约定：`BLOG_CONTENT_REPO` / `BLOG_CONTENT_TOKEN`（细粒度 PAT，仅该仓库 contents 读写）。

## 输出

- `github/` 客户端模块：create branch / commit contents / create PR / upload release asset，错误分类与重试边界；token 不落日志；
- 管理场景（协议层 + Product 层）：
  - `admin.content_save`：文章 → feature 分支 commit（分支命名规则：文章 + 日期；同分支追加 commit）；
  - `admin.content_pr`：为分支创建 / 更新指向 `main` 的 PR（标题 = 文章标题，正文含摘要与变更说明）；
  - `admin.asset_upload`：图片字节流 → release 资产 → 返回服务器代理 URL（`/assets/<...>`）；
  - `admin.content_sync`：触发与启动同一套导入流程（手动同步入口的服务端）；
- 既有 `draftEditor.saveDraft / publish / unpublish` 场景的退役与兼容策略（读侧下线时点与编辑器工作流对齐）；
- mock 场景对等实现（按审定结论）。

## 实施任务

1. GitHub 客户端封装 + 单测（fixture / 录制响应）；
2. 四个管理场景（协议 → Product → mock 对等）；
3. 凭证与错误语义（缺失明错、不静默）；
4. Spec 证据回填。

## 测试/验收

- Rust 测试：分支 / commit / PR / 资产上传的请求构造与错误分支、永不 merge 断言；
- 人工：真实仓库走通 保存 → 分支与 PR 出现 → PR 保持开放。

## 阻塞

无。

## 交付记录
