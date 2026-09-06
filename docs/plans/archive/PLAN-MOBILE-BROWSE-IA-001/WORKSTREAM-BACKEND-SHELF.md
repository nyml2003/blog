---
kind: workstream
id: WORKSTREAM-BACKEND-SHELF
status: completed
plan_id: PLAN-MOBILE-BROWSE-IA-001
role: backend
owner: backend
depends_on: []
write_set:
  - src/core/protocol/src/wire.rs
  - src/core/protocol/src/operation.rs
  - src/core/protocol/src/lib.rs
  - src/core/protocol/src/scene.rs
  - src/backend/product/src/http.rs
  - src/backend/product/src/static_files.rs
  - src/backend/data/src/store/sqlite.rs
  - src/backend/data/src/fixture.rs
  - src/backend/data/src/store/mock.rs
  - src/backend/data/src/store/mod.rs
  - src/backend/mock/src/domain.rs
  - src/backend/mock/src/http.rs
  - src/backend/product/tests/
  - src/backend/mock/tests/
  - docs/specs/SPEC-MOBILE-BROWSE-IA-001.md
last_reviewed: 2026-09-06
---

# 工作流：后端货架快照 + 浏览接口

## 目标

实现 Spec 的货架 wire 变更：服务端分区截断 + 每分区 total，响应条数有界；新增浏览专用接口表达跨维度 AND（决策记录 #7）。

## 输入

- Spec：`SPEC-MOBILE-BROWSE-IA-001`（001 / 003 / 007 场景与契约节）；
- 现状：`to_shelf`（`core/protocol/src/wire.rs`）推荐取 3、类型分区不截断；数据层 `article_shelf`（`backend/data/src/store/sqlite.rs`）全量捞取并已算全量 total；`ArticleShelfQuery` 无分页字段；
- 已核实（2026-09-06 PM）：`build_article_where` 对多 `term_ids` 为单 `EXISTS` + `IN`（同维度 OR）；`term_ids` 被 `public.article_list` / `admin.article_list` 与 Desktop 多选 checkbox 共用——**不得改其语义**。

## 输出

- 分区截断：各类型区前 N=6（常量，命名并加注释，推荐区仍 3）；数据层可继续全量分组计数，但 **wire 下发有界**（分组在内存完成、截断后序列化）；
- `ShelfSection` 增加每分区 `total`（该类型全量计数）；`ShelfData.total` 语义保持全量文章数；
- **新浏览接口**（用户决策 #7）：`/api/public/articles` 新 sceneCode `public.article_browse`（常量进 `scene::` 模块），参数 `type_id?` / `topic_id?` / `tag_id?`（单选，维度间 AND——每维度独立 `EXISTS`；`topic_id` / `tag_id` 需与 term `kind` 匹配，不匹配按参数错误处理）+ `page` / `pageSize`（沿用列表端点默认 20 / 上限 100 约定）；响应沿用 `ArticleListPage` 形态；`public.article_list` 契约零改动；
- product 与 mock 的契约测试更新：shelf 截断条数、分区 total、`total > N` 判定；新接口的 AND 组合（type+topic+tag）、kind 校验、分页边界用例。

## 实施任务

1. wire `ShelfSection.total` + 截断常量与实现；
2. `public.article_browse` 接口（协议 + 数据层查询 + http 分发）；
3. product / mock 测试；
4. Spec 后端场景证据回填。

## 测试/验收

- Rust 测试（product + mock，`cargo test --manifest-path src/Cargo.toml --workspace`）全绿；
- 手动构造 >6 篇同类型文章的数据，验证响应分区 6 条 + total 正确、推荐 3；
- 与前端工作流的联调依赖本工作流完成。

## 阻塞

无。

## 交付记录

- 2026-09-06 PM：派发。基线已核（前端四命令 + Rust workspace 全绿）；多 term 未决项按用户决策 #7 落为新接口任务；写集补 `backend/data/src/store/sqlite.rs`（浏览查询落点）。
- 2026-09-06 后端交付（全部任务完成）：
  - 货架：`SHELF_SECTION_LIMIT=6` / `SHELF_RECOMMENDATION_LIMIT=3` 命名常量（注释引 SPEC 与 FACT-PRODUCT-001）；`ShelfSection.total` = 截断前全量计数（类型分区即该类型全量数）；分组在内存、截断后序列化，下发有界；
  - 浏览接口：`scene::ARTICLE_BROWSE = "public.article_browse"`；`ArticleBrowseQuery` + 协议层 kind 校验（不匹配 → 既有 `INVALID_PAYLOAD`→对外 400 `INVALID_JSON`，未新增错误码）；`build_browse_where` 每维度独立 `EXISTS`（kind 一并入子句）；`build_article_where` 的 `term_ids` OR 语义未动（测试锚定 `public.article_list` 对 `topic_id` 忽略、`term_ids=1,3` 仍 OR）；分页归一化默认 20 / 上限 100；product 与 mock 同形实现；
  - PM 追加项也已交付：`static_files.rs` `PAGES` 补 `/m/articles/list.html` 映射 + 唯一性/覆盖单测；
  - 测试：product 契约（独立端口 + 临时库，>6 篇场景：推荐 3/total、type 分区 6 张 + total 7、下发卡片总数有界断言、三维 AND、kind 错配 400、分页归一化与越界 hasMore、固定查询数 3/4）、mock http 契约同组断言、data mock 单测、wire 单测；agent 自报 workspace 110 passed / 0 failed，fmt + clippy 零告警，PM 复跑复核中；
  - 写集外纯增量文件（PM 追认，见上方 write_set 修订）：`protocol/lib.rs`（re-export）、`protocol/scene.rs`（常量登记）、`data/store/mod.rs`（dispatch 登记）、`data/store/mock.rs`、`mock/domain.rs`、`mock/http.rs`、`product/static_files.rs`；
  - 口径备忘：推荐 section 的 `total` = 截断前推荐条数，仅信息性——前端"查看全部"只按**类型分区**（`type-<id>`）`total > 6` 判定，推荐区永不渲染入口。
- 2026-09-07 PM 追加（验收支持）：用户 dev 模式走查时 default 夹具 9 篇不足以触发"查看全部 / 加载更多"。裁决：不新增 mock scenario（避免动 ops 契约面），改为扩充 Full 夹具本体，mock 与 data 两侧同步、维持对齐不变式；写集追加 `data/src/fixture.rs`。目标 ~45 published（Engineering 28 / Field Notes 12 / Announcements 5）+ terms 加富至 6。
- 2026-09-07 追加任务交付（工作流完成）：
  - 形态：48 篇 = 显式头 12（原样）+ 编译期宏派生追加块 36（`macro_rules!`，无随机源，`&'static` 保持，两侧各带指纹断言 + 对齐责任注释，单侧漂移即测试失败）；published 45 = Engineering 28 / Field Notes 12 / Announcements 5；terms 6（新增 topic `tooling`、tag `ops`）；追加时间戳全压 2026-09-05（避免被真实时钟追平导致管理端新建排不到最前）；推荐 6；
  - AND 命中样本（走查路径）：`Engineering+tooling 9 → +ops 3`；`rust+frontend 0`（空态）；OR 契约不变（`term_ids=1,3` → 18）；
  - 走查实测：货架 total 45、type-1/2 截断 6 + 查看全部、type-3 5 张无入口、下发合计 20 卡有界；平铺页 3 页 20/20/5 到底、hasMore 边界正确；
  - 断言按新语义重算（非机械替换）：data {executor, tests/*}、mock {domain, store, tests/*}、product tests 计数；`cargo test` workspace 133/0（agent 自报连续 3 次，PM 复跑确认）；
  - dev 模式生效方式：`ops runtime dev` 不构建、按 `src/target/debug → release` 解析本地 cargo 产物——agent 已重建 debug mock；release fallback 仍旧数据（集成模式走查前需 `ops delivery build` 或 `cargo build --release`）。
