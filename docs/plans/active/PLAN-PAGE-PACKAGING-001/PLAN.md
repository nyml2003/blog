---
kind: plan
id: PLAN-PAGE-PACKAGING-001
status: ready
owner: project-manager
created: 2026-10-03
last_reviewed: 2026-10-03
---

# 页面与基建的 npm 包化（page-kit / page-build-kit / 页面包）

## 目标

把页面接入能力落成用户要求的 npm 包形态（DECISIONS 2026-10-03 晚间修订）：

1. `@fluvient-loom/page-build-kit`：接页面/构建链的半个框架——校验器、site-routes 生成器、vite 插件、脚手架核心（P1/P2 已交付机制搬家进包）；
2. `@fluvient-loom/page-kit`：写页面的人的半个框架——运行时装配、mount、definePage、页面定义类型（原 D6 范围提前执行）；
3. 页面包形态落地：试点 `desktop-public-detail`（用户点名）转为 workspace 包，导出"页面是什么"（元数据 + 组件工厂），验证 registry 聚合产物路径。

## 关键决策（随阶段闸门确认）

- **P3a 抽 build-kit**（低风险搬家）：`src/frontend/page-registry/` 与 `src/frontend/vite-plugins/` 的机制代码进包并参数化（去掉 `../pages.registry.ts` 默认直连与 settings.tsx 硬编码——INVENTORY §1 列明的耦合点全部变显式参数）；宿主 vite.config 与 ops page check/page new 改为消费包；行为零变化（守卫测试全部保持绿）；
- **P3b 抽 page-kit**：environment 装配 + mount 进包（`./mobile`/`./desktop` 子路径，root 仅纯逻辑，StartupError 等组件留子路径——两端 UI 隔离边界在包内成立）；SPEC-ARCH-BOUNDARY-001 修订为"page-kit 唯一装配点、bootstrap 唯一调用点"（D6.4 已批准的表述）；**foundation（api client/styles/ui）归属是本阶段闸门**：进 page-kit、独立 app-core 包、或暂留宿主——试点迁移时按页面包的真实依赖面定；
- **P3c 试点页面包**：desktop-public-detail 转 `@blog/page-desktop-detail`（workspace 包），导出页面定义；registry 演进为聚合产物（页面包定义 + 宿主内联定义共存，聚合器生成等价注册表）；definePage API 以此页为第一样本（D6.3 要求两样本，第二个样本为首个新增页面或 D11 触发页）；
- **P3d 批量迁移**：其余 16 页按试点经验分批；`ops page new` 脚手架改为生成页面包骨架。

## 成功标准

1. P3a 后：宿主 vite.config/ops 命令只 import 包；`ops quality check` 前端部分与 P1/P2 全部守卫不回归；build-kit 包自身 typecheck/test 通过（对齐 `ops package check` 对 workspace 包的要求）；
2. P3b 后：bootstrap 只剩调用 kit；两端 e2e 不回归；
3. P3c 后：试点页以包形态参与构建与 e2e（desktop-detail 旅程含首绘零清单请求断言全绿）；registry 聚合产物与现状手写注册表等价（守卫测试证明）；
4. 每阶段独立可验收、可回退；P3c 失败不回滚 P3a/P3b。

## 非目标

- 不发布公共 npm（private workspace 包，与既有 16 包同规格；对外发布是后续独立决策）；
- 不做配置平台（用户已明确后置）；
- 不动后端（site-routes 端点、静态服务）；
- D11 多实现 schema 不在本计划（停泊不变，归一化接缝已就位）。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| P3a build-kit 抽取 | frontend | - | `packages/page-build-kit/`（新）、`src/frontend/vite-plugins/`、`src/frontend/page-registry/`、vite.config、package.json、apps/blog 包装层、相关测试迁移 | completed（见 RESULT-P3A.md；顺带修复脚手架清单键序 bug 与 package-guard 历史误杀 bug，`ops package check` 首次全绿） |
| P3b page-kit 抽取 | frontend | P3a | `packages/page-kit/`（新）、`bootstrap/*/environment.tsx`、SPEC-ARCH-BOUNDARY-001、source-layout 门禁、e2e | completed（见 RESULT-P3B.md：装配收敛进包、SPEC 修订为"page-kit 唯一装配点/bootstrap 唯一调用点"、e2e 运行时验证；definePage 随 P3c 试点成形） |
| P3c 试点页面包 + registry 聚合 | frontend | P3b | `packages/pages/desktop-detail/` 或 apps 内页面包位、聚合器、pages.registry 演进、脚手架改造 | completed（见 RESULT-P3C.md：`src/frontend/packages/` 新 workspace 域四包；registry 聚合保序零清单 diff；definePage 定为元数据双出口形态；foundation 闸门按依赖面定：api/纯函数/共享件抽包、styles 留宿主；e2e 试点页包形态实跑通过） |
| P3d 批量迁移 | frontend | P3c 闸门 | 其余页面 | pending |

P3a/P3b 串行（后者动 bootstrap 依赖前者稳定）；P3c 有闸门（foundation 归属 + definePage 形状）。

## 集成验收

- 每阶段：`ops quality check` 前端部分 + `ops package check`（包门禁）+ `ops e2e`（受 persisted-state 既有失败限制时按 001/002 先例记录归属）；
- P3c：聚合产物等价性守卫（与手写注册表 diff 为零或语义等价）+ 试点页 e2e 全绿。

## 未决项

- foundation 归属（P3b 闸门）；
- 页面包放 `packages/pages/*` 还是 `src/frontend` 内新形态（P3c 定）；
- definePage 第二样本（首个新增页面或 D11 触发页）；
- persisted-state 收尾后 quality check 全量复跑（001/002 遗留对账）。
