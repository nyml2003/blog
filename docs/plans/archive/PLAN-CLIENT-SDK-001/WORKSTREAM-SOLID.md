---
kind: workstream
id: WORKSTREAM-CLIENT-SDK-SOLID
status: completed
plan_id: PLAN-CLIENT-SDK-001
role: frontend-solid
owner: frontend-solid
depends_on: [WORKSTREAM-CLIENT-SDK-CORE, WORKSTREAM-CLIENT-SDK-DOMAIN]
write_set: [web/solid/data/, web/mobile/src/, web/desktop/src/]
last_reviewed: 2026-09-05
---

# Solid Resource Adapter

## 目标

为 Solid 页面提供接近 `createResource` 的异步资源体验，同时保持核心和业务协议边界。

## 必须评估

- `snapshot()` 与显式 `latest()`；
- 刷新期间清空当前快照并保留最近成功值；
- `start()` reject 捕获；
- 过期任务结果丢弃；
- `refetch()` 且不提供 `mutate()`；
- 不强制 Suspense/ErrorBoundary 集成；
- 组件销毁时取消任务。

## 验收

- adapter 只接受 `DataTask` 工厂，不接受普通 Promise；
- adapter API 泛型化，不出现业务类型专用实现；
- 页面能显式消费 loading、snapshot、latest、error 和刷新状态；
- PC/Mobile 接入保持实现隔离。
