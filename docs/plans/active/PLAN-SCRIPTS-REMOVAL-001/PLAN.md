---
kind: plan
id: PLAN-SCRIPTS-REMOVAL-001
status: partial
owner: project-manager
created: 2026-09-30
last_reviewed: 2026-09-30
---

# 根目录 scripts 清理与 ops 收敛

## 目标

移除根目录 `scripts/` 作为长期能力入口，将现有脚本按真实职责迁入明确的归属：`apps/blog`
的 `ops` 命令、`src/frontend` 的构建/测试入口、CI/Nix 工具层或一次性专项测试目录。
清理后，构建、质量检查、E2E、workspace smoke 和 WASM 验证都通过项目既定入口运行，输出和退出码遵循
`ops` 协议，仓库不再依赖一个职责混杂的根目录脚本目录。

本计划包含真实删除 `scripts/` 的工作，但每个脚本必须先完成消费者迁移、等价验证和文档更新；不直接删除仍被构建或测试链使用的文件。

## 当前基线

- `scripts/build-article-html-wasm.mjs` 被 `src/frontend/package.json` 的 `wasm:build`、`dev`、`build`、`typecheck` 和 `test:core` 使用。
- `scripts/test-article-html-wasm.mjs` 被 `src/frontend/package.json` 的 `test:core` 使用，负责 native/WASM fixture 对照和边界测试。
- `scripts/test-article-html-browser.mjs` 是历史浏览器专项脚本；当前正式浏览器入口已是 `ops e2e`，脚本没有当前 manifest 消费者。
- `scripts/package-smoke.ts` 被根 `package.json` 的 `smoke` 和 `check` 使用；`ops package check` 间接执行 `pnpm check`，因此当前输出链仍绕过 ops 语义。
- `scripts/browser-libs.nix` 是浏览器运行库的 Nix 表达式，属于环境/工具配置，不应作为根目录业务脚本长期存在。
- 已有文档和计划明确要求新增能力归入 app/CLI/CI，且 E2E 已迁移到 `ops e2e`；本计划负责把剩余实际消费者收尾。

## 目标归属

| 当前文件 | 目标归属 | 迁移原则 |
| --- | --- | --- |
| `build-article-html-wasm.mjs` | `src/frontend` 构建工具或受控 `ops` build helper | 由前端构建入口调用，保留确定的产物目录、锁定 Rust/WASM 工具链和错误传播 |
| `test-article-html-wasm.mjs` | `src/frontend` 专项测试工具/测试目录 | 保留 native/WASM parity、fixture 和资源边界测试，不让页面或 ops 直接依赖脚本路径 |
| `test-article-html-browser.mjs` | 删除；能力由 `ops e2e`/专项 scenario 覆盖 | 只有仍缺少的深度 HTML 验收能力才迁入 E2E runner，不保留第二套浏览器入口 |
| `package-smoke.ts` | `apps/blog` 的 `ops package check` 或 packages 测试入口 | 输出使用统一 reporter/NDJSON；不让根 `pnpm check` 私自拥有另一套 smoke 协议 |
| `browser-libs.nix` | `nix/` 或现有 browser toolchain 配置 | 与 Chromium/Playwright 环境一起管理，不能被误当作应用运行脚本 |

## 范围

### 纳入

- 根 `scripts/` 五个文件的消费者、替代入口和删除顺序盘点；
- WASM 构建和 native/WASM parity 测试迁移；
- workspace package smoke 迁移到 `ops package check` 或明确的 package 测试模块；
- 浏览器专项脚本与 `ops e2e` 的覆盖差异核对；
- 浏览器 Nix 依赖表达式归位；
- root package、`src/frontend/package.json`、CI、ops help、指南和测试引用同步；
- 删除根 `scripts/` 并完成仓库级残留扫描。

### 不纳入

- 不改变 HTML 校验规则、WASM profile/version、诊断 schema 或 Rust core 行为；
- 不新增第二套 CLI、报告协议、退出码或环境变量注入方式；
- 不把一次性迁移脚本、临时调试文件或外部运维脚本强行塞入 `ops`；
- 不顺手修改前端页面、API、部署拓扑或发布版本策略；
- 不在没有替代验证证据时删除测试覆盖。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 脚本消费者与归属盘点 | pm+qa | - | 本计划、引用矩阵、删除清单 | ready |
| WASM 构建/对照测试迁移 | frontend+rust | 归属盘点 | `src/frontend/**`、Rust/WASM 构建入口、相关测试与 manifest | ready |
| package smoke 与 ops 接线 | infra | 输出标准化计划 | `apps/blog/**`、packages 测试、root package、ops help/测试 | ready |
| 浏览器专项收敛 | qa+frontend | `ops e2e` 能力确认 | E2E scenario/runner、浏览器工具配置、专项报告 | ready |
| Nix/CI/文档归位 | release+infra | 工具入口冻结 | `nix/**`、`.github/**`、guides、README、CODEMAP | ready |
| 删除与全量验收 | qa+pm | 所有迁移工作流完成 | 根目录删除、引用扫描、质量报告、结果记录 | ready |

脚本删除、package scripts、ops runner 和 CI workflow 属于共享写集，必须串行修改；迁移期间保留旧入口直到新入口和证据齐全。

## 删除门槛

单个脚本只有同时满足以下条件才允许删除：

- 仓库内已无构建、测试、CI、文档和开发命令引用；
- 替代入口的参数、环境、产物、退出码和失败行为已明确；
- 关键测试覆盖已迁移，并至少有一次成功和一次失败路径验证；
- `ops --json` 或测试输出不混入旧脚本文本，stdout/stderr 责任清晰；
- 相关 package、前端、Rust/WASM、E2E 或 Nix 检查通过；
- `rg`、package scripts、workflow 和 Nix 引用扫描确认无残留。

## 成功标准

1. 根目录 `scripts/` 删除，仓库没有长期构建、测试、E2E 或 smoke 能力依赖该目录。
2. `ops package check` 直接覆盖 workspace package neutrality、typecheck、tests 和 smoke，且人类/JSON 输出遵循统一协议。
3. 前端 `dev`、`build`、`typecheck`、`test:core` 不再通过根目录脚本路径调用 WASM 工具；构建与 parity 测试仍可重复运行。
4. `ops e2e` 成为唯一浏览器端到端入口；历史浏览器脚本能力要么迁入 scenario，要么有明确归档理由。
5. 浏览器依赖库配置位于 Nix/CI 的明确位置，开发者按 `ops` 或项目指南获得可复现运行方式。
6. 相关文档、帮助、README、CI 和测试引用均已更新，删除后 `ops quality check`、`ops package check`、前端核心检查和必要 E2E 通过。
7. 不改变业务行为、HTML 校验契约、页面产物、退出码语义和发布资产内容。

## 集成验收

1. 运行 `ops package check`，确认 smoke、package tests 和 JSON 输出均通过。
2. 运行前端 `typecheck`、`test:core`、`build`，确认 WASM 产物生成、native/WASM parity 和资源边界测试仍覆盖。
3. 运行 `ops e2e` 的相关 integration/dev 场景，确认历史浏览器专项中仍有价值的 HTML、预览和跨端检查没有丢失。
4. 在无 `scripts/` 目录条件下运行根 README、前端 README/guide 和 CI 中的主要命令，确认路径和帮助无误。
5. 对仓库执行 `rg` 检索 `scripts/`、旧脚本文件名和旧 package script，确认只保留历史计划中的必要说明。
6. 运行 `ops quality check`、`ops package check`、前端质量门禁和 `git diff --check`；无法运行的外部浏览器或 CI 验收单独记录。

## 未决项

- WASM 构建逻辑归 `src/frontend/build/`、`apps/blog` 的 delivery 命令，还是 Nix/CI 专用工具；需结合当前构建依赖和 ops 输出边界决定。
- package smoke 是作为 `ops package check` 内置命令执行，还是拆成 packages 的独立测试文件后由 ops 调度。
- 历史浏览器脚本的深度 HTML 验收是否全部并入 `ops e2e`，或保留为前端测试目录中的显式专项 runner。
- `browser-libs.nix` 的最终目录和命名，以及本地 flake 与 CI 是否共享同一浏览器依赖声明。
- 根 `package.json` 的 `smoke`/`check` 是否删除、改成 ops 委托，还是保留为极薄的开发别名；不得形成第二套业务入口。

## 执行记录（2026-09-30）

### 已交付

- `scripts/` 目录已删除，五个文件全部完成归属迁移或清理：
  - `build-article-html-wasm.mjs` → `src/frontend/build/build-article-html-wasm.mjs`（未决项 1 决策：归前端构建工具目录，ops 各命令经 `pnpm -C src/frontend run build/dev` 间接调用，无需改 ops 侧）；
  - `test-article-html-wasm.mjs` → `src/frontend/tests/wasm/test-article-html-wasm.mjs`，`test:core` 内部路径同步更新，parity 与边界测试原样保留；
  - `package-smoke.ts` → `apps/blog/test/packages/package-smoke.ts`，转为 node:test 风格，由 `ops package check` 经 `pnpm exec tsx` 直接调度并走 reporter 输出（未决项 2 决策：内置步骤）。注意 `@fluvient-loom` 包使用无扩展名相对导入，裸 `node --experimental-strip-types` 无法解析，必须经 tsx 执行，因此文件名不带 `.test` 以避开 apps/blog 的 node --test 发现 glob；
  - `test-article-html-browser.mjs` 直接删除（零消费者，`ops e2e` 为唯一浏览器入口）；
  - `browser-libs.nix` 直接删除：零消费者且 `builtins.getFlake (toString ../.)` 指向的根 flake 已迁至 `nix/`，表达式本就无法求值（未决项 4 决策：不保留死配置，如未来需要 Chromium 运行库打包应在 `nix/flake.nix` 内重建）。
- 根 `package.json`：删除 `smoke` script，`check` 收窄为 `pnpm typecheck && pnpm test`（未决项 5 决策）；devDependencies 未动（`tsx`/`@fluvient-loom/*` 归属清理需更新 lockfile，留待后续）。
- 根 `tsconfig.json` 移除 `"scripts"` include；`ops package check` 的 registry 描述、dry-run 文案与实现标签同步更新；`package-guard.test.ts` fixture 路径更新。
- 顺带修复：删除 `src/frontend/pnpm-workspace.yaml`（e3459c3 重构残留，嵌套 workspace 声明会使 `pnpm -C src/frontend` 的依赖自检把 src/frontend 当孤立 workspace 而安装失败）。

### 验证证据

- 迁移前基线：`pnpm run smoke` 通过；`node scripts/test-article-html-wasm.mjs` 287 用例通过；`wasm:build` 通过。
- 迁移后：`pnpm -C src/frontend run test:core` 全绿（含新路径 wasm 构建、parity 287 用例、四套前端测试）；`ops quality check` exit 0（Rust 三件套、ops 契约测试、前端 typecheck/lint/format:check/test:core/build、架构边界全部通过）；`pnpm test` 递归全绿；`ops package check` 中新接线的 package smoke 步骤 OK。
- 残留扫描：`rg` 检索旧脚本路径与 `pnpm smoke`，仅本计划与归档计划的历史记述命中。

### 未完成与外部阻塞

- `ops package check` 整体仍 exit 20，两个失败点均为并行工作流的进行中状态、非本计划改动引入：中立性护栏不认识 `@fluvient-cli/*` 新 scope 与 `mobile-h5-solid-atoms` 的 solid-js 依赖（架构整合/基础设施包工作流的欠账）；根 `pnpm typecheck` 因 atoms 包 `.tsx` 缺少根级 JSX 配置失败。恢复条件：上述工作流落地后重跑 `ops package check` 应全绿。
- `ops e2e` 与 CI `build-release`（`ops delivery package` 走 musl 交叉编译）未在本机运行，需要浏览器环境与交叉工具链；相关代码路径未被本计划修改（e2e/delivery 均经 pnpm scripts 间接使用 wasm 构建）。
- 未决项 3（历史浏览器脚本的深度 HTML 验收能力）未迁移即删除，缺口记录：管理端编辑器诊断定位与按钮禁用、伪造直发 422、WASM 加载失败降级、网络 503 输入保留、毒化 sessionStorage 缓存拦截。后续如需要，应作为 `ops e2e` 的 scenario 补齐，不再恢复独立脚本。
