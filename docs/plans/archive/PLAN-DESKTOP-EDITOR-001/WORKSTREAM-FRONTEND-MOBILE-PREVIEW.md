---
kind: workstream
id: WORKSTREAM-FRONTEND-MOBILE-PREVIEW
status: completed
plan_id: PLAN-DESKTOP-EDITOR-001
role: frontend-mobile
owner: frontend-mobile
depends_on:
  - WORKSTREAM-FRONTEND-DESKTOP
write_set:
  - src/frontend/mobile/pages/admin-article-preview-content/index.html
  - src/frontend/mobile/src/pages/admin-preview-content.tsx
last_reviewed: 2026-09-07
---

# 工作流：Mobile 已保存版本预览

## 目标

提供独立的固定 375px Mobile 阅读页，供 Desktop 编辑器的端到端预览入口直接打开已保存草稿或已发布文章。

## 输出

- 从 `browserClient.adminArticles.get` 读取文章；
- 仅在 API 返回的 `htmlInspection.valid` 为 true 时将 `contentHtml` 交给 `ArticleBody`；
- 显示已保存版本、文章状态和返回编辑入口；
- 复用 Mobile 自身的阅读组件与样式，不导入 Desktop UI。
- `/admin/articles/preview/mobile.html` 直接挂载该页面，不使用 Desktop 管理台外壳或 iframe。

## 验证

- 前端 typecheck、lint、核心测试及生产构建通过；
- 浏览器视觉与交互由用户验收。
