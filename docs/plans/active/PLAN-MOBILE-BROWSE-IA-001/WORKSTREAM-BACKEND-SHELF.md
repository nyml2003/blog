---
kind: workstream
id: WORKSTREAM-BACKEND-SHELF
status: ready
plan_id: PLAN-MOBILE-BROWSE-IA-001
role: backend
owner: backend
depends_on: []
write_set:
  - src/core/protocol/src/wire.rs
  - src/core/protocol/src/operation.rs
  - src/backend/product/src/http.rs
  - src/backend/product/tests/
  - src/backend/mock/tests/
  - docs/specs/SPEC-MOBILE-BROWSE-IA-001.md
last_reviewed: 2026-09-06
---

# 工作流：后端货架快照

## 目标

实现 Spec 的货架 wire 变更：服务端分区截断 + 每分区 total，响应条数有界；核实并按需对齐多 term 的 AND 组合语义。

## 输入

- Spec：`SPEC-MOBILE-BROWSE-IA-001`（001 / 007 场景与契约节）；
- 现状：`to_shelf`（`core/protocol/src/wire.rs`）推荐取 3、类型分区不截断；数据层 `article_shelf`（`backend/data/src/store/sqlite.rs`）全量捞取并已算全量 total；`ArticleShelfQuery` 无分页字段。

## 输出

- 分区截断：各类型区前 N=6（常量，命名并加注释，推荐区仍 3）；数据层可继续全量分组计数，但 **wire 下发有界**（分组在内存完成、截断后序列化）；
- `ShelfSection` 增加每分区 `total`（该类型全量计数）；`ShelfData.total` 语义保持全量文章数；
- 多 term 组合语义核实：`build_article_where` 对多个 `term_ids` 是 AND 还是 OR；若非 AND（topic + tag 组合场景），最小改动对齐 AND，并补测试；超出最小改动即回 PM 转用户确认；
- product 与 mock 的 shelf 契约测试更新：截断条数、分区 total、`total > N` 判定、多 term AND 用例。

## 实施任务

1. wire `ShelfSection.total` + 截断常量与实现；
2. 多 term 语义核实与（如需）对齐；
3. product / mock 测试；
4. Spec 后端场景证据回填。

## 测试/验收

- Rust 测试（product + mock）全绿；
- 手动构造 >6 篇同类型文章的数据，验证响应分区 6 条 + total 正确、推荐 3；
- 与前端工作流的联调依赖本工作流完成。

## 阻塞

无。

## 交付记录
