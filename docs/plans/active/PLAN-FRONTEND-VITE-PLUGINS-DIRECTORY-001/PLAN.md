---
kind: plan
id: PLAN-FRONTEND-VITE-PLUGINS-DIRECTORY-001
status: ready
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# Vite 插件独立目录

## 目标

`src/frontend/build/` 目前混合了两类东西：Vite 插件（`page-template.ts`、`page-bootstrap.ts`、`mobile-prefetch.ts`）和非插件的构建脚本（`build-article-html-wasm.mjs`，wasm 构建，与 Vite 插件机制无关）。插件数量随 Mobile 性能优化等工作持续增长。将全部 Vite 插件收敛到一个单独目录，使"Vite 插件"与"其他构建工具"的归属清晰，新插件有明确的落点。

这是一次小范围、单领域的代码组织调整，本计划刻意保持轻量。

## 成功标准

1. 全部 Vite 插件位于同一个专属目录，目录内只有 Vite 插件及其直接辅助模块；wasm 构建脚本等其他构建工具不留在该目录。
2. `vite.config.ts` 与相关测试（`tests/build/page-template.test.ts`、`tests/build/page-bootstrap.test.ts`）的 import 全部更新，仓库级引用扫描确认旧路径无残留消费者。
3. 移动为纯位置调整：插件实现、输出产物、页面模板语义零变化（可用构建产物或测试对照佐证）。
4. 前端 typecheck、lint、相关测试、`vite build` 通过；引用该路径的文档（CODEMAP 等）同步更新。

## 非目标

- 不改插件实现行为、产物或 `pages.registry` 语义。
- 不顺手重构插件代码，不将插件迁移到 `packages/` workspace（是否沉淀为 `@fluvient-loom` 包是独立决策，不在本计划）。
- 不动 `build-article-html-wasm.mjs` 的归属（已由 `PLAN-SCRIPTS-REMOVAL-001` 落定）。

## 约束与依据

- **写集冲突（实施前必须核对）**：`src/frontend/build/mobile-prefetch.ts`、`src/frontend/vite.config.ts`、`src/frontend/sw/` 当前有未提交改动，属于 Mobile 体验优化二期正在进行的性能工作。本计划必须在该工作提交后基于最新内容实施，或与其协调串行；不得回退或覆盖其改动。
- 现有质量门禁未按路径引用 `build/`（已核对 `ops/src/` 与 source-layout 测试），移动不涉及门禁规则变更。
- 依据：`docs/CODEMAP.md` 目录地图中 `build/` 的现描述；移动后更新。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 插件目录迁移 | frontend | 二期未提交改动落定 | `src/frontend/build/` 插件文件 → 新目录、`vite.config.ts`、`tests/build/` 相关测试、CODEMAP | blocked by 写集 |

单工作流，无需拆分。

## 集成验收

1. `rg` 扫描旧路径引用为零。
2. `pnpm typecheck`、`pnpm lint`、`tests/build` 两项测试、`vite build` 通过。
3. 移动前后 `vite build` 产物入口清单（各页 HTML 与 assets 文件名）对照一致。

## 未决项

- 新目录的名称与位置（如 `src/frontend/vite-plugins/`、`build/plugins/` 等）：实施时与产品一句确认即可，不构成阻塞。
- `tests/build/` 是否随新目录改名对齐。
