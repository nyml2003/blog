---
kind: workstream
id: WORKSTREAM-CLIENT-SDK-DOMAIN
status: completed
plan_id: PLAN-CLIENT-SDK-001
role: frontend-core
owner: frontend-core
depends_on: [WORKSTREAM-CLIENT-SDK-CORE]
write_set: [web/common/client/]
last_reviewed: 2026-09-05
---

# 业务 Client SDK

## 目标

以领域能力而非 REST 资源提供业务调用入口，返回领域对象或领域结果。

## 验收

- 能力对象由统一 `Client` 组装；
- DTO、URL、HTTP method 和 Zod schema 不泄漏到业务组件；
- 页面 View Model 不进入 Client SDK；
- 至少覆盖文章查询、推荐和草稿操作的代表协议。
