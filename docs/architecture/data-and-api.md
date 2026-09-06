---
kind: architecture
id: ARCH-DATA-API
status: current
owner: backend
last_reviewed: 2026-09-05
---

# Data and API 架构

## 数据对象

- `Article`：标题、可选摘要、类型、正文 HTML 片段、状态、时间和主题/标签关联；摘要最多 160 个 Unicode 字符，空摘要合法；
- `ArticleType`：可由管理端新增和重命名；
- `Term`：主题或标签，可由管理端新增和重命名；
- `RecommendationSet`：当前生效的已发布文章排序集合。

## API 约定

- 业务接口只使用 `GET` 和 `POST`；
- `sceneCode` 采用 `端点.场景` 命名；
- 公开接口位于 `/api/public/*`，管理接口位于 `/api/admin/*`；
- 响应使用 `{ code, message, data }` envelope；
- 客户端不能写入服务端时间字段；
- 同一筛选维度按 OR，不同维度按 AND；
- 默认排序为 `updated_at DESC, id DESC`。

## 可见性

公开查询隐含 `status = published`。草稿、取消发布的文章和不存在的公开文章不泄露管理状态。

## 推荐

推荐只引用已发布文章。MVP 当前推荐规则为最近更新的 6 篇文章，由管理端手动替换生效集合。

## Mobile Shelf BFF

- C Mobile 文章库使用 `GET /api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf` 读取模型；
- BFF 在服务端完成推荐、筛选、文章类型排序、分区分组和空分区隐藏，客户端不重复归一化业务数据；
- 推荐 section 最多返回 3 篇卡片；类型 section 使用稳定的 `type-<id>` 标识；
- BFF section 使用 `articles` 字段，卡片只返回列表展示字段，不返回正文 HTML；现有文章、推荐和类型公共接口继续保留。
