---
kind: spec
id: SPEC-MOBILE-SHELF-BFF-001
status: accepted
owner: backend
plan_id: PLAN-MOBILE-DENSITY-001
last_reviewed: 2026-09-10
---

# Mobile Shelf BFF 读取模型

## 目标

为 C Mobile 文章库提供已经完成推荐、类型、筛选和排序归一化的页面读取模型。客户端只负责渲染和滚动交互，不在浏览器中合并业务数据。

## 接口

```text
GET /api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf
```

沿用公共文章筛选参数：`term_ids`、`type_id`、`created_from`、`created_to`、`updated_from`、`updated_to`。

响应使用 `{ code, message, data }` envelope，`data` 包含 `sections`、`total`、`hasFilters` 和 `warnings`。

## 归一化规则

- 无筛选条件时，首个 section 为 `recommendation`，最多包含 3 个已发布推荐文章；
- 有任一筛选条件时不返回推荐 section；
- 类型 section 按后端文章类型顺序返回；无文章类型不返回；未知类型追加到末尾；
- section ID 使用 `recommendation` 或 `type-<id>`，不使用可变名称；
- section 使用 `articles` 字段承载 Shelf 卡片；每项只返回 `id`、`title`、`summary`、`updatedAt` 和 `terms`，不返回正文 HTML；
- 推荐不可用时，类型 sections 仍可返回，并在 `warnings` 标记降级；文章列表或类型读取失败时整体失败。

## 无抖动边界

- BFF 返回稳定排序和完整分区，客户端不得在滚动期间重新分组、排序或分页合并；
- BFF 不返回 viewport-specific 像素高度；卡片几何和必要的 ResizeObserver/锚点补偿属于 Mobile UI 层；
- 现有文章、推荐和类型公共接口继续保留，BFF 是新增读取模型，不破坏其他消费者。

## 验收

- Go 服务测试覆盖推荐截取、筛选、类型顺序、空分区、未知类型和降级 warning；
- HTTP 测试覆盖 sceneCode、响应结构、字段裁剪和错误边界；
- 客户端只发起一次 Shelf BFF 请求，不调用 URL/history API 实现分区定位。
