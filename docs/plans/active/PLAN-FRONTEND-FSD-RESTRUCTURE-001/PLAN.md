---
kind: plan
id: PLAN-FRONTEND-FSD-RESTRUCTURE-001
status: ready
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# 前端目录重组：功能切片与向下依赖

## 目标

把 `src/frontend/` 从"按技术层分目录"（habitat 下的 components/logic/pages/styles/ui）重组为"按功能切片分目录 + 严格向下依赖"（对话定稿的 FSD 适配版）。行为零变化：纯位置与 import 路径重构，不改任何运行时语义、样式效果或公共契约面。

核心收益只有一条，也是验收的中心：**依赖方向机械化**——`bootstrap → 平台世界(pages → widgets → features → foundation) → domain/protocol/validation`，同层 slice 互不 import，全部由门禁测试逐条拦截。目录形态是这条规则的产物。

## 设计输入（2026-10-01 对话定稿，实现不得偏离）

```
src/frontend/
├── bootstrap/{desktop,mobile}/          # 组合根（现名保留，行业术语）
├── mobile/  desktop/                    # 两个平台世界（UI 隔离边界）
│   ├── pages/<slice>/page.tsx + page.css
│   ├── widgets/<slice>/ui.tsx + ui.css + model.ts
│   ├── features/<slice>/model.ts + persistence.ts
│   └── foundation/{styles,ui}/          # 端内基础层（替代歧义的 shared）
├── kernel/                              # 纯机制层（desired-state），禁副作用（闸门 6 已决）
├── domain/<entity>/model.ts             # 跨端业务实体（对齐"领域"词汇）
├── protocol/                            # 与 src/core/protocol 同名对称
└── validation/
```

命名要点：`foundation` 消除双 shared 歧义；`domain` 对齐 CODEMAP 词汇；`protocol` 前后端同名；`persistence.ts` 替代 `storage.ts`（与 `PersistencePort` 词汇一致）；`ui.css` 与 `ui.tsx` 同名配对；segment 名（ui/model/page）是位置槽位，领域信息由 slice 目录携带，不违反风格指南的禁通用名条款。

## 当前基线（2026-10-01 现场核实）

- 现结构：`app/{kernel,habitat/{api,desktop,mobile,validation},bootstrap}`；`SPEC-ARCH-BOUNDARY-001`（accepted，今日复核）将此分层成文——**本计划必须修订该 Spec**，属公共契约变更，需明确决策。
- 门禁现状：`tests/app/architecture/source-layout.test.ts` 仅 40 行 6 断言（pages 不碰 `context.api|navigation|persistence`、部分目录禁 zod/solid import）——重组后需重写为层序检查，规则数会显著增加；另有同名测试 `tests/source-layout.test.ts` 管测试代码归位，重写时其规则保留。
- 既有资产映射（2026-10-01 复核修正）：`desktop-ui/` 已删除，无并入对象；`habitat/mobile/ui/molecules` ↔ `mobile/foundation/ui`；`habitat/mobile/styles/` 现存 11 个 CSS（全局 tokens/base/app + 壳与域样式 shell/shelf/detail/browse/article-body/components/layout/pages），全局三件进 `foundation/styles`，其余随 slice 走；`@fluvient-loom/mobile-h5-solid-atoms` 是跨消费包（blog+playground），**不并入**。
- 冲突面（2026-10-01 复核修正）：NAV-ACTIONS 已同日 completed 归档，其产出（mobile-nav 结构、页面 BFF 接入）是本计划的迁移对象而非冲突方；现 active 冲突方为——APP-SHELL（`pages.registry.ts`、`vite-plugins/page-template.ts`、Mobile shell 模板、bootstrap/mobile、样式、e2e，与本计划每一片迁移重叠，串行第一对象）、组件体验（`styles/shell.css`、组件结构）、SEARCH（`pages.registry.ts`、搜索面）。
- `pages.registry.ts` 的 entry/outputPath、`vite-plugins/` 页面模板、e2e 断言中的选择器无关但产物路径有关。

## 迁移策略（吸收 CONSOLIDATION 计划教训）

1. **门禁先行**：先写并合入新层序测试（对新结构路径生效、旧路径按迁移进度纳入），迁移每完成一片，测试覆盖就跟上——不以"最后统一补测试"收尾。
2. **垂直切片逐片闭环**：每片经历"移动 → import 更新 → registry/模板路径 → 测试绿 → 旧文件删"完整闭环；禁止一次性大爆炸移动。
3. **顺序**：先 mobile（冲突面小、页面少）后 desktop；每端内部先 foundation/domain/protocol（被依赖方）再 pages/widgets（依赖方）。
4. **行为零变化证据**：入口 HTML 清单、E2E 旅程、`ops perf mobile` 数字对照；chunk 文件名因路径变化允许不同，不作为回归判据。

## 决策闸门（实现前确认）

1. **时机**：**已决（2026-10-01，PM）**——先重构后功能：本计划最优先执行，APP-SHELL/SEARCH/组件体验由 PM 调度压后，在新结构上写。
2. **widgets 层**：**已决（2026-10-01，PM）**——保留完整四层（pages/widgets/features/foundation），article-card 等先归 widgets。
3. **desktop-ui 归宿**：**问题失效（2026-10-01 现场核实）**——`desktop-ui/` 已在早期整合中删除（CODEMAP 已记录），现存引用只有 `apps/blog/src/quality/architecture.ts` 与 layout 测试里的墓碑正则；迁移对象是 `app/habitat/desktop/{components,logic,pages,styles}`，墓碑禁令并入新层序门禁统一承载。
4. **Spec 修订节奏**：**已决（2026-10-01，PM）**——与 mobile 迁移并行起草修订草案，两端完成、门禁全量生效时定稿 accepted；修订范围与新措辞由草案承载。
5. **命名终稿**：**已决**——按设计输入执行（foundation/domain/protocol/persistence、segment 名 ui/model/page、文件名 `persistence.ts`）。
6. **kernel 位置**：**已决（2026-10-01，PM）**——升为 `src/frontend/kernel/`，与 domain/protocol/validation 同层的纯机制位；现有纯度门禁（kernel 禁 fetch/window/localStorage 等）原样映射。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 结构设计定稿与 Spec 修订草案 | frontend+pm | - | 本目录设计记录、SPEC 修订草案 | in_progress（设计已定稿，草案并行起草） |
| 决策闸门 | 产品+pm | 设计草案 | 本 PLAN.md、Spec 修订立项 | completed（2026-10-01 六题全决） |
| 新层序门禁落地 | frontend | 闸门 | `source-layout.test.ts` 重写、相关测试 | ready |
| mobile 侧逐片迁移 | frontend | 门禁先行 | `mobile/`、`bootstrap/mobile/`、registry、vite 模板、测试 | blocked |
| desktop 侧迁移 | frontend | mobile 侧完成 | `desktop/`、`desktop-ui/`（按闸门 3）、registry、模板 | blocked |
| 旧壳删除与文档收尾 | frontend+pm | 两端完成 | 删 `app/habitat` 旧结构、CODEMAP、architecture、RESULT.md | blocked |

## 成功标准

1. 新层序门禁全量生效且真实拦截（每条规则用故意违规验证一次"变红"）。
2. 同层 slice 互不 import、跨端零 UI import、依赖只向下——以门禁通过为证。
3. 行为零变化：入口 HTML 清单一致、`ops e2e --mode integration` 通过、`ops perf mobile` 关键数字不回归。
4. `SPEC-ARCH-BOUNDARY-001` 修订版生效，CODEMAP 与架构快照同步。
5. 相关 typecheck/lint/test/build 与 `ops quality check` 通过。

## 非目标

- 不改任何运行时行为、样式语义、API 消费方式或状态逻辑。
- 不动 `packages/`（atoms 包、port/common/query 等原样）。
- 不趁机修防御代码、不加功能、不做视觉调整——发现问题记录移交对应计划。
- 不改变 Desktop/Mobile 隔离与"共享层无 UI"规则。

## 约束与依据

- **写集串行（硬约束）**：与 APP-SHELL（registry、vite 模板、bootstrap/mobile、样式、e2e，逐片重叠）、组件体验（壳样式）、SEARCH（registry、搜索面）三个 active 计划在 mobile 文件上重叠，四方写集协调段已互认——闸门第 1 题未定前，任何一方不得先动共享文件；两两实施前互核最新状态。
- `pages.registry.ts`、`site-routes.json`、路由 golden 是迁移期间必须持续一致的单一事实源；每片迁移后三处同步。
- 依据：AGENTS 稳定边界（端隔离、共享范围）、`SPEC-ARCH-BOUNDARY-001`（修订对象）、风格指南文件形态条款（segment 名为位置槽位的辩护已记录）。

## 集成验收

1. 逐片迁移前后：该片页面 HTTP 可达、旅程断言通过、旧文件已删且引用扫描为零。
2. 全量完成后：门禁"变红"演练、E2E 全旅程、perf 对照、`ops quality check`。
3. Spec 修订与 CODEMAP/架构文档复核通过，本目录留迁移台账（片清单、日期、证据）。

## 未决项

- Spec 修订措辞与新门禁规则清单——随草案与门禁落地产出；闸门六题已于 2026-10-01 全部关闭。
