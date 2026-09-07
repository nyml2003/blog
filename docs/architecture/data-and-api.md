---
kind: architecture
id: ARCH-DATA-API
status: current
owner: backend
last_reviewed: 2026-09-07
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

## 正文 Profile

Rust Product 和 Mock 使用 `article-html-core` 的 `article-html/v1` 校验正文。无效草稿保留原文并返回诊断；已发布文章不能被无效更新覆盖，发布不能绕过检查。管理端 Article 成功响应追加 `htmlInspection`，拒绝时为 HTTP 422 / `INVALID_ARTICLE_HTML` / `data.htmlInspection`。

Data 不解释 HTML；它提供仅草稿可更新和按检查过的完整原文条件发布两个原子操作，防止跨请求竞态。发布前 Product 读取持久化正文校验，Data 条件发布失败返回 `ARTICLE_CHANGED`（409），必须重新读取/校验。公开详情和返回正文的推荐结果同样拒绝或过滤不合法的存量正文。完整语法、限制和兼容性见 `SPEC-ARTICLE-HTML-VALIDATION-001`。

## 推荐

推荐只引用已发布文章。MVP 当前推荐规则为最近更新的 6 篇文章，由管理端手动替换生效集合。

## Mobile Shelf BFF

- C Mobile 文章库使用 `GET /api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf` 读取模型；
- BFF 在服务端完成推荐、筛选、文章类型排序、分区分组和空分区隐藏，客户端不重复归一化业务数据；
- 推荐 section 最多返回 3 篇卡片；类型 section 使用稳定的 `type-<id>` 标识；
- BFF section 使用 `articles` 字段，卡片只返回列表展示字段，不返回正文 HTML；现有文章、推荐和类型公共接口继续保留。

## 公开 T 型货架 BFF

- Mobile `/m/articles/index.html` 与 `/m/articles/list.html` 继续使用既有 F 型信息架构；其他公开展示货架通过 `GET /api/public/t-shelf?sceneCode=public.t_shelf` 读取 T 型模型；
- `surface` 为必填参数：`recommendation` 仅在当前推荐集合内筛选，`archive` 在全部公开文章内筛选；
- `filter_id` 可省略，默认选择稳定首项 `all`；其他值为正整数文章类型 id。响应的 `filters` 始终返回完整有序列表，首项固定为 `{ "id": "all", "name": "全部" }`，后续项沿用 Data 返回的文章类型顺序；
- 初次请求一次返回 `filters`、`selectedFilterId`、当前筛选的 `articles` 与截断前 `total`。切换筛选时用新的 `filter_id` 重新请求；请求竞态由客户端按最新选择处理；
- `articles` 最多返回 20 张列表卡片，只含 `id`、`title`、`summary`、`updatedAt`、`terms`，不含正文；
- 缺少或不支持的 `surface`、非法 `filter_id`、不存在的文章类型均返回 HTTP 400 / `INVALID_JSON`。Product 与 Mock Product 各自在自己的 BFF 层实现相同语义。
