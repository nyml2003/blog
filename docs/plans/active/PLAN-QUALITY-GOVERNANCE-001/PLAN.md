---
kind: plan
id: PLAN-QUALITY-GOVERNANCE-001
status: ready
owner: project-manager
created: 2026-10-02
last_reviewed: 2026-10-02
---

# 质量治理

## 目标

建立一套能区分“快速门禁”“共享包门禁”“真实运行验收”和“浏览器验收”的质量治理基线，让质量检查结果可以代表当前代码状态，也让未执行的运行时证据不会被误认为已经通过。

本计划承接 2026-10-02 的稳定性复核，优先处理已经确认的治理问题：

- `ops package check` 的平台中立性扫描器误报合法 `@fluvient-loom/*` workspace 导入；
- 真实 runtime E2E 和浏览器 E2E 不在默认质量门禁中，当前缺少本轮统一验收记录；
- `docs/plans/README.md` 与 active 目录中的计划状态存在漂移，已完成计划仍可能被登记为 active；
- 质量命令、测试层级和验收证据之间缺少一份当前可执行的对应关系。

计划只治理验证体系和项目记录，不改变博客产品功能、API 契约、前端平台边界或部署架构。

## 成功标准

1. `ops package check` 在当前 workspace 上通过；平台中立性规则对 `@fluvient-loom/*`、`@fluvient/core`、CLI 包和明确声明的宿主适配器分别有正例与反例测试，避免再次出现规则自相矛盾或误报。
2. 真实 runtime 验收完成并留存结果：`OPS_RUNTIME_E2E=1` 覆盖进程、端口、信号和清理行为；`OPS_RUNTIME_E2E=full` 追加 integration 构建与交付构建路径。失败时记录准确命令、退出码和环境限制。
3. 浏览器验收完成并留存结果：`ops e2e --mode integration`，以及 `dev` 的 `empty`、`slow`、`server-error`、`malformed-response` 场景；报告、截图和诊断产物记录在对应 `target/e2e/<run-id>/` 下。
4. 计划索引与目录状态一致：只有仍在执行或等待明确决策的计划留在 `active/`；已完成、部分完成、暂停或被替代的计划移动到 `archive/` 并保留结果说明；历史文档中的状态引用不再误导当前工作。
5. 更新测试与运维指南，明确每个质量命令的覆盖范围、运行成本、是否默认执行、必需环境和证据位置；文档链接、示例命令和 `git diff --check` 通过。
6. 计划收尾时提供一份质量矩阵和验证记录，区分已执行、历史证据、未执行和受环境限制的检查；相关源码、测试、文档和计划改动通过对应局部检查及 `ops quality check`。

## 非目标

- 不新增博客页面、API、文章状态或部署能力。
- 不把所有慢速 runtime/browser E2E 强行并入默认快速门禁；是否在 CI 中定期运行另行决策。
- 不借治理计划顺手重构前端、CLI、Rust 服务或 workspace 包的业务实现。
- 不批量升级依赖、刷新 lockfile 或修改全局开发环境。
- 不删除历史计划、结果、截图或报告；只修正当前索引和明确过期的活动状态。

## 约束与依据

- 协作规则：`AGENTS.md` 的“验证标准”“Plan 语义”和“变更安全”。
- 当前质量入口：`apps/blog/src/quality/quality-check.ts`、`apps/blog/src/quality/package-check.ts`。
- 当前包护栏：`apps/blog/src/quality/package-guard.ts` 及 `apps/blog/test/commands/package-guard.test.ts`。
- 测试分层说明：`docs/guides/testing.md`、`docs/guides/operations.md`。
- 运行时契约：`SPEC-OPS-RUNTIME-001`、`SPEC-OPS-OUTPUT-001`、`SPEC-OPS-PARAMETERS-001`。
- 架构边界：`SPEC-ARCH-BOUNDARY-001`。
- 当前基线：主 `ops quality check` 已通过；`ops package check` 当前因中立性扫描误报返回 20；runtime 进程测试默认由 `OPS_RUNTIME_E2E` 门控，浏览器 E2E 独立运行。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 包门禁规则修复与回归 | frontend + quality | - | `apps/blog/src/quality/package-guard.ts`、对应测试 | ready |
| 真实 runtime 验收 | qa + infrastructure | 包门禁修复（用于统一报告） | 验收记录、运行产物引用；必要时只修复发现的门禁缺陷 | ready |
| 浏览器 E2E 验收 | qa + frontend | 可用 Chromium/Playwright 环境 | 验收记录、`target/e2e/` 产物引用；必要时只修复阻断验收的缺陷 | ready |
| Plan 与质量文档治理 | project-manager | 核对所有 active 计划状态 | `docs/plans/README.md`、明确过期的 active/archive 路径、`docs/guides/testing.md` | ready |
| 集成复核与收尾 | project-manager + quality | 上述工作流完成 | 本计划 `RESULT.md`、质量矩阵和未决项 | pending |

各工作流的源码写集互不重叠；runtime/browser 验收默认只写产物和记录，发现产品缺陷时必须单独说明，不把修复扩大成隐式功能工作。计划索引移动和文档修改与其他计划记录串行执行。

## 集成验收

1. 运行 `ops package check`，确认中立性正例、反例、package smoke、workspace typecheck 和 test 全部通过。
2. 运行 `OPS_RUNTIME_E2E=1 ops quality check`，记录真实进程、端口、退出信号和清理结果；资源或工具不足时保留完整错误输出。
3. 运行 `OPS_RUNTIME_E2E=full ops quality check`，确认 integration 和 delivery 构建级用例通过，或明确区分构建失败与环境缺失。
4. 使用项目要求的 Playwright 模块和 Chromium 路径运行 integration 及四个 dev 场景，核对最终 `report.json`、截图、console/pageerror 和退出码。
5. 审核 `docs/plans/README.md` 与 `docs/plans/{active,archive}` 的 front matter、链接和状态；对已完成计划补齐 `RESULT.md` 或明确以 `partial`/`parked` 收尾。
6. 运行相关 TypeScript 测试、文档链接/命令检查、`git diff --check` 和最终 `ops quality check`；在 `RESULT.md` 中列出未执行项和残余风险。

## 未决项

- 浏览器 E2E 是否纳入 CI 的必需检查，还是保留为发布前/定期验收；需要结合 Chromium 可用性和运行时长决定。
- `ops package check` 是否继续作为独立门禁，还是在稳定后由 `ops quality check` 汇总其结果；暂不改变现有命令契约。
- active 计划索引清理的边界：只处理当前已确认的状态漂移，还是同时审计所有历史文档中的旧路径和旧包名。
- runtime/full 和浏览器验收是否需要固定测试数据、固定浏览器版本及性能基线；先记录现状，再决定长期固定矩阵。
