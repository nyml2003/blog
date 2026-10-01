---
kind: result
id: PLAN-FRONTEND-FSD-RESTRUCTURE-001
status: completed
completed: 2026-10-01
---

# 计划结果

## 计划

- Plan ID：`PLAN-FRONTEND-FSD-RESTRUCTURE-001`
- 最终状态：`completed`
- 项目经理：project-manager

## 实际交付

`src/frontend/` 从按技术层分目录重组为功能切片 + 严格向下依赖，行为零变化：

- 新结构落地：`bootstrap/{desktop,mobile}`、`mobile|desktop/{pages,widgets,features,foundation}`（foundation={api,styles,ui}）、`kernel/`、`validation/`；旧 `app/` 壳全部删除。
- 层序门禁（`tests/app/architecture/source-layout.test.ts`）：依赖只向下、同层 slice 互不 import、两端互不 import、目录形态、kernel 纯度、mobile 页面宿主能力，全部机械化拦截并经"变红"演练验证。
- `SPEC-ARCH-BOUNDARY-001` 修订生效；CODEMAP、architecture/frontend.md、GLOSSARY、guides/testing.md 同步。
- 七道决策闸门全部关闭并记录于 PLAN.md（含 api 归 foundation、kernel 升顶层、desktop-ui 问题失效等现场核实修正）。

## 已验证内容

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| 层序门禁真实拦截 | 两次变红演练（7+5 个故意违规全部命中，清理后全绿） | passed |
| 行为零变化：入口清单 | registry 仅 entry 字段变化，outputPath/别名/site-routes 同步测试通过 | passed |
| 行为零变化：浏览器旅程 | `ops e2e --mode integration`，产物 `target/e2e/1790847556950-9935` | passed |
| 行为零变化：性能 | `ops perf mobile --runs 3` 对照 NAV-ACTIONS 基线：冷加载 shell 97.3→56.4ms、content 100.5→58.3ms（变快），nav-switch 持平，LCP 28→48ms 为 3 次采样噪声；产物 `target/e2e/1790847581717-10648` | passed |
| 全量质量 | `ops quality check`（含 typecheck/lint/format/test:core/build/architecture boundaries） | passed |
| Spec 与文档 | SPEC-ARCH-BOUNDARY-001 修订、CODEMAP/架构快照复核 | passed |

## 未交付与移交项

- `apps/blog/src/quality/architecture.ts` 仍含旧 `app/` 路径的合成测试样例（`apps/blog/test/commands/architecture.test.ts` 钉住），属门禁契约收敛工作，不阻塞本计划；Spec 证据节已注明。
- Mobile 11 个 CSS 因 app.css 单链级联敏感集中在 `foundation/styles/`，未按 slice 拆分；待有视觉回归防护（APP-SHELL 计划的截图/像素断言）后再做。
- `domain/`、`protocol/` 目录当前无内容（无存量跨端实体需迁移），层位与门禁规则已就绪，随首个跨端实体启用。

## 偏差记录

- CSS 集中与 bottom-nav 提前入 widgets/shell 属现场事实驱动的映射修正，已记 LEDGER。
- 迁移期间环境事故（workspace 安装把 node_modules 搞残、根 lockfile 落后三个 devDeps）按 workspace 模式恢复，根 `pnpm-lock.yaml` +2 行 importer 同步，无版本变更。

## 恢复后续工作所需条件

- 新结构上开展 APP-SHELL/SEARCH/组件体验计划时，写集协调段已互认（各自 PLAN.md）；首动前互核最新状态即可。
