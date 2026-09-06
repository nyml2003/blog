---
kind: workstream
id: WORKSTREAM-CLIENT-DATA-PRODUCT
status: ready
plan_id: PLAN-CLIENT-DATA-001
role: product
owner: product
depends_on: []
write_set: [docs/specs/, docs/plans/active/PLAN-CLIENT-DATA-001/PLAN.md]
last_reviewed: 2026-09-05
---

# 领域能力协议

## 目标

定义业务方依赖的领域能力、输入、领域对象、领域错误和验收场景，不暴露资源 API 或后端字段。

## 输出

- `ArticleCatalog`、`RecommendationFeed`、`DraftEditor` 等能力清单；
- 输入/输出和错误协议；
- `SPEC-*` 场景及迁移优先级。

## 边界

- 返回领域对象或领域结果；
- 不返回页面 View Model；
- 不决定缓存、状态管理或框架绑定；
- 可选字段使用 `undefined`，清空使用显式领域命令，不使用 `null`。

## 验收

- 业务协议可在不改变调用方的情况下替换后端传输实现；
- 每个 MVP 能力至少有正常、失败和边界场景。
