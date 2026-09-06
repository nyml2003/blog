---
kind: workstream
id: WORKSTREAM-CLIENT-DATA-SOLID
status: ready
plan_id: PLAN-CLIENT-DATA-001
role: frontend-solid
owner: frontend-solid
depends_on: [WORKSTREAM-CLIENT-DATA-CORE]
write_set: [web/src/solid/, web/src/mobile/, web/src/desktop/]
last_reviewed: 2026-09-05
---

# Solid 响应式适配

## 目标

将核心 DataTask 映射为符合 Solid 生命周期和响应式模型的使用方式，不改变领域能力协议。

## 输出

- `useDataTask` 等 Solid adapter API；
- 自动启动、取消和组件销毁绑定；
- 至少一个 C 端和一个 B 端流程的迁移示例。

## 约束

- adapter 依赖 core，core 不依赖 Solid；
- 业务组件不直接调用 fetch、Zod 或 transport；
- 页面 View Model 在页面侧生成；
- PC/Mobile 组件实现继续隔离。

## 验收

- 参数变化不会留下过期任务结果；
- 组件销毁会取消未完成任务；
- 加载、成功、失败和取消状态可被 Solid 页面稳定消费；
- React/Vue 后续可以新增同级 adapter，无需修改 core 和领域协议。
