---
kind: workstream
id: WORKSTREAM-MOBILE-DENSITY-BACKEND
status: completed
plan_id: PLAN-MOBILE-DENSITY-001
role: backend
owner: backend
depends_on: [WORKSTREAM-MOBILE-DENSITY-PRODUCT]
write_set: [migrations/, internal/storage/, internal/article/, internal/httpapi/, docs/architecture/data-and-api.md, web/common/contracts/domain.ts]
last_reviewed: 2026-09-05
---

# 文章摘要与 Mobile Shelf BFF

## 目标

为可编辑摘要提供兼容的数据库、领域和 HTTP 契约，并为 C Mobile 提供已经完成业务归一化的 Shelf 读取模型。

## 输出

- 版本 2 SQLite 迁移和嵌入式迁移列表；
- `Article.Summary` 及所有文章查询响应；
- 160 Unicode 字符服务端校验和 HTTP 错误码；
- 迁移、领域和 API 回归测试。
- `GET /api/public/mobile/article-shelf` BFF 及稳定 sections DTO；
- 推荐截取、类型分组、筛选归一化、空分区隐藏和降级 warning；
- BFF 卡片字段裁剪，不向 Mobile 列表返回正文 HTML。

## 阻塞

无。

## 交付记录

2026-09-05：摘要迁移、领域服务、HTTP 422 校验、公共响应摘要和回归测试已完成；根据用户最新决定，新增 Mobile Shelf BFF 作为本计划未完成的后端工作。

2026-09-05：完成 Shelf BFF、共享 DTO、接口契约和 HTTP 回归测试。接口在无筛选时返回最多 3 条推荐，筛选时隐藏推荐，按后端 taxonomy 顺序输出非空类型分区；推荐失败降级为 warning，卡片不包含正文 HTML。`go test ./...` 通过。
