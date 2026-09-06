---
kind: workstream
id: WORKSTREAM-MOBILE-DENSITY-PM
status: completed
plan_id: PLAN-MOBILE-DENSITY-001
role: project-manager
owner: project-manager
depends_on: []
write_set: [docs/plans/active/PLAN-MOBILE-DENSITY-001/, docs/specs/]
last_reviewed: 2026-09-05
---

# 计划协调与集成验收

## 目标

由一个独立的项目经理 agent 负责本计划的推进、分工、依赖管理和最终验收，不直接替代产品、视觉或前端工作流。

## 输入

- 本计划及所有 workstream 文档；
- `FACTS.md`、当前架构和现有代码状态；
- 用户对产品目标、范围和永久事实的最新决定。

## 输出

- 明确的 agent 分工、启动顺序和交付时间点；
- 每个 workstream 的状态、阻塞项和交付记录；
- 集成验收证据；
- 计划结果文档，并在完成后将计划移动到 `docs/plans/archive/`。

## 实施任务

- 将计划状态从 `ready` 推进到 `in_progress`，并登记当前负责的 agent；
- 先锁定产品页面语义，再由 backend 交付 BFF sections 契约，最后启动 Mobile UI；视觉同步约束分区几何与无抖动验收；
- 检查每个 agent 的 `write_set`，避免 PC、B 端和共享契约被非目标修改；
- 收集 `SPEC-*`、视觉规范和实现证据，组织最终验收；
- 发现阻塞时保留上下文并明确下一步，不通过猜测改变产品目标、永久事实或公开契约；
- 计划完成后更新架构、Spec 和结果文档，清理临时执行记录；在 BFF 和 Mobile 新实现通过验收前不得标记完成。

## 测试/验收

- 依赖顺序真实执行，未满足前置条件的工作流不得标记完成；
- 验收覆盖 F 型 Shelf 的信息密度、筛选可用性、触控、滚动、截断、加载/空/错状态和 PC 隔离；
- 代码质量检查和移动端手工/浏览器验收均有证据；
- 最终结果能回溯到稳定的 `SPEC-*` 场景。

## 权限边界

- PM 可自主决定 agent 分工、任务拆解、执行顺序和验证方式；
- 涉及产品目标、永久事实、公开 API/领域契约或超出本计划范围的变化，必须先向用户确认；
- PM 不应亲自替代专业 agent 完成视觉设计或业务代码，除非明确记录为临时兜底并说明原因。

## 阻塞

无。用户已确认 F-Shelf 的实际交互和衔接动画满足预期。

## 交付记录

2026-09-05：根据用户最新决定，将计划从已完成实现退回进行中；改为 Mobile BFF + 页面级分区 Shelf + 无 URL 变更 + 无抖动布局，并收窄各 workstream 写集。

2026-09-05：按三个并行 workstream 集成完成。已验证 BFF 实际响应、筛选行为和生产构建；共享请求层的 camelCase/snake_case 筛选参数不一致也已修复并加测试。计划保持 `in_progress`，直到固定视口的手工视觉验收有证据。

2026-09-05：用户完成实际交互验收并确认结果，授权关闭并归档本计划。
