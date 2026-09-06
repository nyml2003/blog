---
kind: workstream
id: WORKSTREAM-CLIENT-SDK-CORE
status: completed
plan_id: PLAN-CLIENT-SDK-001
role: frontend-core
owner: frontend-core
depends_on: []
write_set: [web/common/data/]
last_reviewed: 2026-09-05
---

# 通用 Data SDK

## 目标

实现业务无关、框架无关的 DataTask、Result、Transport/DataSource 边界和外部数据解析能力。

## 验收

- 不导入业务模块、Solid、React、Vue 或 DOM；
- DataTask 惰性、单次启动、可取消；
- 成功、协议错误、取消、超时和异常均可测试；
- 为 DataStream 保留独立扩展点但不实现实时流；
- JSON transport、超时、取消、协议错误和 `DeepReadonly` 有测试。
