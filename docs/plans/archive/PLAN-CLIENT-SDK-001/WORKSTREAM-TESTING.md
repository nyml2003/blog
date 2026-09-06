---
kind: workstream
id: WORKSTREAM-CLIENT-SDK-TESTING
status: completed
plan_id: PLAN-CLIENT-SDK-001
role: frontend-core
owner: frontend-core
depends_on: [WORKSTREAM-CLIENT-SDK-CORE, WORKSTREAM-CLIENT-SDK-DOMAIN, WORKSTREAM-CLIENT-SDK-SOLID]
write_set: [web/common/**/*.test.ts, web/solid/**/*.test.ts]
last_reviewed: 2026-09-05
---

# SDK 与 Adapter 测试

## 覆盖范围

- DataTask 生命周期、取消、单次启动和异常捕获；
- latest/snapshot 在刷新、失败和成功后的语义；
- 过期任务不会覆盖新结果；
- Data SDK 不依赖业务和 Solid；
- Client SDK 的领域协议和 DTO 映射；
- Solid adapter 启动、取消和 refetch；
- 业务组件不直接使用底层 transport。
