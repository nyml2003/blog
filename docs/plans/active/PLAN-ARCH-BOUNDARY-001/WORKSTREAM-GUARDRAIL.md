---
kind: workstream
id: WORKSTREAM-GUARDRAIL
status: in_progress
plan_id: PLAN-ARCH-BOUNDARY-001
role: infra
owner: infra
depends_on:
  - WORKSTREAM-AUDIT
write_set:
  - ops/src/
  - ops/tests/
  - docs/api/
  - src/backend/product/tests/api_routes.rs
  - src/frontend/common/client/client.test.ts
  - src/frontend/package.json
  - docs/guides/testing.md
  - docs/specs/SPEC-ARCH-BOUNDARY-001.md
last_reviewed: 2026-09-06
---

# 工作流：分层门禁（R1）

## 目标

把 Spec 的分层禁令实现为 `ops quality` 的自动化检查（import / 模块依赖规则），存量违规以显式豁免清单登记，规则自身有测试。

## 输入

- Spec 前端 / 后端禁令表；
- AUDIT-REPORT 的豁免清单初稿；
- 先例：mobile-ui 依赖边界检查的现有实现方式。

## 输出

- `ops quality` 新增分层检查（或独立 `ops arch check` 子命令并入 quality）：
  - 前端 import 规则：页面 / 组件 / 查询层 / client 各自的禁令表 + 组合根白名单；
  - 后端规则：`core/protocol` 禁业务决策的实现方式（模块依赖 + 对编排函数位置的静态检查，如 `to_shelf` 类函数不得驻留 protocol）；
  - **API 路由 golden 清单 + 双端对照测试**（Spec 契约节）：一份中性清单（endpoint × sceneCode × method），Rust 测试断言 `http.rs` 分发与 `scene.rs` 常量全覆盖且一致，TS 测试断言 `client.ts` 方法 ⊆ 清单；与 CONTENT-TRUTH REPO-CONTRACT 的管理协议冻结协调为同一事实源；
  - 豁免清单机制：登记文件（含治理目标轮次），清单外违规即红，清单内项逐轮清零；
- 检查规则的正负样例测试（故意违规的 fixture 必须红）；
- `docs/guides/testing.md` 补门禁说明。

## 实施任务

1. 规则实现与豁免机制；
2. 全库存量违规登记入册（与 AUDIT-REPORT 对齐）；
3. 规则自测 + `ops quality` 集成；
4. Spec 证据回填。

## 测试/验收

- ops 契约测试全绿；fixture 违规样例全部被拦截；
- 豁免清单 = AUDIT-REPORT 全集，无漏登；
- 现有 `ops quality check` 行为对既有绿色项目无回归。

## 阻塞

无（R0 审定后即可开工）。

## 交付记录

- 2026-09-07：执行启动；写集补入 API golden、Rust/TS 对照测试和 `test:core` 集成入口。
