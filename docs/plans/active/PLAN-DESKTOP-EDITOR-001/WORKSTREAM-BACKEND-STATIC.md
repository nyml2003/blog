---
kind: workstream
id: WORKSTREAM-BACKEND-STATIC
status: completed
plan_id: PLAN-DESKTOP-EDITOR-001
role: backend-product
owner: backend-product
depends_on:
  - WORKSTREAM-FRONTEND-DESKTOP
write_set:
  - src/backend/product/src/static_files.rs
  - src/backend/product/tests/contract.rs
last_reviewed: 2026-09-06
---

# 工作流：Product 静态路由

## 目标

让 Product 集成运行模式能够托管前端生成的编辑器指南，并完成独立预览页的生产路由移除。

## 输入

- 前端产物：`desktop/pages/admin-editor-guide/index.html`；
- Spec 场景：`SPEC-DESKTOP-EDITOR-001-006`、`SPEC-DESKTOP-EDITOR-001-008`；
- 现有静态页面精确映射：`src/backend/product/src/static_files.rs`。

## 输出

- `/admin/editor-guide/index.html` 映射到指南静态产物；
- `/admin/articles/preview.html` 不再属于 Product 页面映射并返回 404；
- 单元测试与 Product 契约测试覆盖两个路径。

## 测试/验收

- `cargo test -p blog-product`；
- 前端构建产物包含 `desktop/pages/admin-editor-guide/index.html`；
- 浏览器体验由用户验收，不在本工作流中代验。

## 交付记录

- 2026-09-06：Product 静态映射已用指南入口替换旧预览入口；`cargo test -p product` 全部通过（3 unit + chain + contract + residency），`cargo fmt --all --check` 通过。
