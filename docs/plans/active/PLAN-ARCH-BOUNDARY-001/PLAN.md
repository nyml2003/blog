---
kind: plan
id: PLAN-ARCH-BOUNDARY-001
status: in_progress
owner: project-manager
created: 2026-09-06
last_reviewed: 2026-09-06
---

# 架构边界治理（页面去数据化 / 后端四层归位）

## 目标

按 [SPEC-ARCH-BOUNDARY-001](../../../specs/SPEC-ARCH-BOUNDARY-001.md) 治理边界腐化：前端建立查询层并把数据装配从页面剥净（页面只管 UI 编排）；后端把 `http.rs` 拆为协议适配、把 BFF 编排从 protocol crate 迁回 Product；分层规则进 `ops quality` 门禁长效防复发。**零行为变化**，内部实现不动。

## 决策记录（用户已定）

1. 前端原则：页面只管 UI 编排，数据获取归数据层（查询层）；
2. 后端原则（用户认可提案）：HTTP 只管协议适配、编排独立成 BFF 层、protocol 纯契约、Data 类型化事务域；
3. 治理对象 = 边界腐化；**内部实现先不重点关注**（非目标明列）；
4. 零行为变化：公开契约与页面行为不变，既有测试为护栏；
5. 门禁自动化 + 存量豁免清单逐轮清零；API 路由 golden 清单 + 双端对照测试，收敛 path/sceneCode 在 `http.rs` / `scene.rs` / `client.ts` 的三份手抄（不做双语言 codegen，低依赖取舍）。
6. 查询层落位为 `src/frontend/solid/queries/`：共享无 UI 的查询用例，Desktop / Mobile 的 DOM、视觉与交互继续隔离；
7. 用户负责最终产品验收；执行 agent 负责实现、自动化测试和可复核的浏览器证据。

## 成功标准

1. 页面（含两端全部页面）零 `common/client` / `solid/data` / `common/data` import（组合根白名单除外），数据装配全部在查询层；
2. `http.rs` 无 BFF 决策；`to_shelf` 等编排逻辑位于 Product BFF 模块；`core/protocol` 只含形状映射；
3. 分层门禁进 `ops quality` 且豁免清单清零；门禁规则自身有测试；
4. 全量既有测试（product / mock / 前端）绿，API 响应与迁移前一致；
5. 架构文档（frontend.md / backend.md / data-and-api.md）与规则同步。

## 非目标

- 见 Spec 非目标节：不重构内部实现、不改行为、不加功能、不优化性能、不动既有 UI 边界规则。

## 约束与依据

- Spec：`SPEC-ARCH-BOUNDARY-001`（本计划交付并验收，规则本身是长期 Spec）；
- 违规实例清单：Spec 前端 / 后端两节的"现状违规实例"（2026-09-06 立项时逐文件核得）；
- 既有先例：mobile-ui 依赖边界检查（门禁机制推广）、`SPEC-CONTENT-GITHUB-TRUTH-001` 层间接口节（Data/Product 边界表述吸收）；
- 写集协调（重约束）：`http.rs` / `wire.rs` 在 CONTENT-TRUTH 与 BROWSE 计划写集内；`client.ts` / 各页面文件在 BROWSE / ATOM-EXPANSION 写集内——治理整改轮次必须排在这些计划归档或写集交接之后串行。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 边界审查（R0） | backend | - | 见 [WORKSTREAM-AUDIT.md](./WORKSTREAM-AUDIT.md) | completed |
| 分层门禁（R1） | infra | R0 | 见 [WORKSTREAM-GUARDRAIL.md](./WORKSTREAM-GUARDRAIL.md) | ready |
| 前端治理（R2） | frontend | R1；BROWSE / ATOM-EXPANSION 归档 | 见 [WORKSTREAM-FRONTEND.md](./WORKSTREAM-FRONTEND.md) | ready |
| 后端治理（R3） | backend | R1；CONTENT-TRUTH 后端写集交接 | 见 [WORKSTREAM-BACKEND.md](./WORKSTREAM-BACKEND.md) | ready |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 轮次与验收

| 轮 | 内容 | 验收 |
| --- | --- | --- |
| R0 | 全库边界审查报告（违规清单 file:line + 目标落位 + 查询层位置定稿） | **报告与查询层落位报用户审定** |
| R1 | 门禁进 `ops quality` + 豁免清单登记（全部存量违规入册） | 门禁规则测试绿；豁免清单经用户过目 |
| R2 | 前端：查询层落地 → 页面逐端去数据化 → 豁免逐项清零 | 页面零越权 import；行为回归绿 |
| R3 | 后端：`http.rs` 拆适配 / BFF 模块独立 / `wire.rs` 去编排 → 豁免清零 | Spec 场景 003/004；Rust 测试绿 |
| 收尾 | 架构文档同步、Spec 推进 accepted | 文档与门禁规则一致 |

## 集成验收

- 门禁全量生效（豁免清零）+ 四命令与 Rust 测试全绿；
- 迁移前后 API 响应 diff 抽查一致；两端页面行为走查；
- Spec 证据回填。

## 未决项

- R2/R3 的具体排期按本轮执行 agent 写集交接时点串行推进。
