---
kind: workstream
id: WORKSTREAM-CLIENT-DATA-CORE
status: ready
plan_id: PLAN-CLIENT-DATA-001
role: frontend-core
owner: frontend-core
depends_on: [WORKSTREAM-CLIENT-DATA-PRODUCT]
write_set: [web/src/shared/data/]
last_reviewed: 2026-09-05
---

# 纯 TypeScript 数据任务核心

## 目标

实现与 UI 框架无关的领域协议、DataTask、错误归一化、运行时解析和传输适配边界。

## 输出

- `Result<T, E>`、`DataTask<T, E>` 和可取消生命周期；
- DataSource/Transport 接口；
- Brand type 和 Zod schema 边界；
- DTO 到领域对象的映射；
- 未来 `DataStream` 的扩展位置，不实现实时流。

## 约束

- DataTask 惰性创建、显式 `start()`、单次执行；
- core 不依赖 Solid、React、Vue 或 DOM；
- transport 仅 JSON 可表达字段和值；
- Zod 错误转为稳定的领域/协议错误；
- 不实现缓存和客户端状态。

## 验收

- 未调用 `start()` 前无副作用；
- 成功、协议错误、远端错误、取消和超时均可测试；
- 不同 transport 可替换而不修改领域能力接口。
