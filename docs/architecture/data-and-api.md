---
kind: architecture
id: ARCH-DATA-API
status: current
owner: backend
last_reviewed: 2026-10-07
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

Rust Product 和 Mock 使用 `article-html-core` 的 `article-html/v1` 校验正文。无效正文不会写入草稿，也不能覆盖已发布文章或绕过发布检查；拒绝时保留诊断供客户端展示。管理端 Article 成功响应追加 `htmlInspection`，拒绝时为 HTTP 422 / `INVALID_ARTICLE_HTML` / `data.htmlInspection`。

Data 不解释 HTML；它提供仅草稿可更新和按检查过的完整原文条件发布两个原子操作，防止跨请求竞态。发布前 Product 读取持久化正文校验，Data 条件发布失败返回 `ARTICLE_CHANGED`（409），必须重新读取/校验。公开详情和返回正文的推荐结果同样拒绝或过滤不合法的存量正文。完整语法、限制和兼容性见 `SPEC-ARTICLE-HTML-VALIDATION-001`。

## 推荐

推荐只引用已发布文章。MVP 当前推荐规则为最近更新的 6 篇文章，由管理端手动替换生效集合。

## Mobile 页面聚合 BFF

- H5 移动端页面通过 `GET /api/public/mobile/page?sceneCode=public.mobile_page&page=<name>` 一次取回页面所需的全部数据；`page` 取 `home`、`article-list`、`article-detail`、`settings`；
- 响应为 `{ modules: [{ moduleKey, data }] }`，恒含 `mobile.navigation`（左/右图标与可选 `shareUrl`），其余按页面追加：`home` 附 `mobile.t-shelf`，`article-list` 附 `mobile.category-shelf`，`article-detail` 附 `mobile.article-detail`，`settings` 附空数据模块；
- 文章不存在或未发布时详情模块被省略、外层仍为 200 OK，由前端按"模块缺失"渲染"文章不存在或暂不可见"；
- 小程序端只复用其中 `page=home`；文章列表/搜索/详情在小程序直接使用 `category-shelf`、`article_search` 与 `article_detail` 端点（同协议客户端），语义一致但请求路径不同。

## Mobile 分类货架 BFF

- `GET /api/public/mobile/category-shelf?sceneCode=public.mobile_category_shelf&category_id=<ID>` 也作为独立端点保留；
- 响应包含 taxonomy、最终选中的分类 ID、文章卡片和总数，卡片不返回正文 HTML；
- 选择一级分类时汇总其全部后代叶子分类，选择二级分类时汇总该分支下的叶子分类；
  同一篇文章属于多个命中叶子时只返回一次，且只返回已发布文章；
- 缺省分类由服务端按稳定规则选定；非法或不存在的 `category_id` 按请求错误处理；
- 旧的 `/api/public/mobile/article-shelf` 仍是兼容接口，但不再是当前两个公开 Mobile
  文章入口的数据源。

## 公开 T 型货架 BFF

- Desktop 首页、文章列表等 T 型展示通过 `GET /api/public/t-shelf?sceneCode=public.t_shelf` 读取模型；Mobile 首页的同类数据经 `mobile/page?page=home` 的 `mobile.t-shelf` 模块下发，两个 Mobile 文章入口使用分类货架，不混用两种筛选语义；
- `surface` 为必填参数：`recommendation` 仅在当前推荐集合内筛选，`archive` 在全部公开文章内筛选；
- `filter_id` 可省略，默认选择稳定首项 `all`；其他值为正整数文章类型 id。响应的 `filters` 始终返回完整有序列表，首项固定为 `{ "id": "all", "name": "全部" }`，后续项沿用 Data 返回的文章类型顺序；
- 初次请求一次返回 `filters`、`selectedFilterId`、当前筛选的 `articles` 与截断前 `total`。切换筛选时用新的 `filter_id` 重新请求；请求竞态由客户端按最新选择处理；
- `articles` 最多返回 20 张列表卡片，只含 `id`、`title`、`summary`、`updatedAt`、`terms`，不含正文；
- 缺少或不支持的 `surface`、非法 `filter_id`、不存在的文章类型均返回 HTTP 400 / `INVALID_JSON`。Product 与 Mock Product 各自在自己的 BFF 层实现相同语义。
