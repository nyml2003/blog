---
kind: plan
id: PLAN-DESKTOP-EDITOR-001
status: in_progress
owner: project-manager
created: 2026-09-06
last_reviewed: 2026-09-06
---

# B Desktop 文章编辑器升级（CodeMirror + 分屏实时预览）

## 目标

按 [SPEC-DESKTOP-EDITOR-001](../../../specs/SPEC-DESKTOP-EDITOR-001.md) 将 Admin 创作端共用的文章编辑器升级为 CodeMirror v6 源码编辑 + 同页分屏实时预览，实现边写边看；HTML 校验唯一权威保持 Rust profile 的 WASM 实现，新增适配层只做位置映射与诊断展示；移除独立预览页与 sessionStorage 中转。

## 成功标准

1. new/edit 页正文编辑区为 CodeMirror（高亮 / 行号 / 自动缩进），中文多字节内容编辑与光标操作正确，元数据栏与操作按钮行为不变；
2. 诊断唯一来源是 WASM `inspectHtml`；字节偏移 → CodeMirror 位置映射准确，点击诊断定位正确；防抖 / 取消 / 陈旧结果丢弃行为保留；
3. 分屏预览在 iframe 沙箱中以与前台一致的正文样式防抖同步渲染；预览不是门禁，`valid()` 仍完全由 WASM 结果决定，发布门禁不回归；
4. `/admin/articles/preview.html`、跳页预览按钮、`preview-cache` 及其 test:core 条目全部移除，构建产物无该入口；
5. 保存 / 保存并发布 / 取消发布的成功与失败路径（含服务端校验失败回填诊断）与升级前一致；
6. Admin 提供一个不进入文章列表、不请求后端的静态编辑器指南入口；指南通过页签讲解快速开始、正文格式、校验与预览、保存与发布，并提供符合当前 HTML Profile 的可复制示例；
7. `pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿。

## 非目标

- 不做富文本编辑、自动保存 / 防丢稿、快捷键体系；
- 不打磨 Admin 列表、taxonomy 等其他页面；
- 不修改 Rust profile / WASM 校验语义与后端接口；
- 不重构 Desktop CSS 模块化，不引入 Desktop 主题。

## 约束与依据

- 事实：`FACT-PRODUCT-001`（个人长期沉淀的技术博客，创作端唯一用户是作者本人）；
- Spec：`SPEC-DESKTOP-EDITOR-001`（本计划交付并验收）；
- 归档契约：`PLAN-ARTICLE-HTML-VALIDATION-001` —— 手写 Rust HTML Profile、native/WASM 共享校验、后端权威门禁与 B Desktop 诊断；本计划消费该链路，不改其语义；
- 架构事实：校验接线为 `client.draftEditor.inspectHtml` → `common/validation/wasm.ts`（Rust WASM）；`useHtmlInspection` 已实现防抖 / 取消 / 陈旧判定；诊断带 UTF-8 字节偏移，textarea 时代经 `byteOffsetToSelection` 映射；Desktop 为 MPA，样式集中在单文件 `styles.css`。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 前端（desktop） | frontend-desktop | - | 见 [WORKSTREAM-FRONTEND-DESKTOP.md](./WORKSTREAM-FRONTEND-DESKTOP.md) | in_progress |
| Product 静态路由 | backend-product | frontend-desktop | 见 [WORKSTREAM-BACKEND-STATIC.md](./WORKSTREAM-BACKEND-STATIC.md) | completed |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 集成验收

按 Spec 场景逐项验收：

- 自动化：字节偏移 → CodeMirror 位置映射纯函数单测（含多字节边界）、适配层诊断转换、editor 集成冒烟；
- 人工：新建 / 编辑全流程、长中文文档编辑与诊断点击定位、分屏同步流畅度、发布门禁、`/admin/articles/preview.html` 确认移除；
- 质量基线：`pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿；
- Spec 状态推进 `accepted`，证据回填。

## 执行上下文

- **启动时间**：2026-09-06；项目经理已确认唯一工作流 `frontend-desktop` 并派发执行。
- **工作区冲突**：`src/frontend/vite.config.ts` 同时存在 Mobile Theme Settings 计划的未提交改动；本计划不得覆盖该写集，集成时需逐项复核并串行合并。
- **基线证据**：`pnpm --dir src/frontend lint` 通过；`typecheck`、`build`、`test:core` 在 `wasm:build` 阶段因 Rust Wasm schema `0.2.121` 与本机 wasm-bindgen CLI `0.2.126` 不匹配而阻断。该问题记录为环境基线阻塞，不改变本计划的 Rust/WASM 契约。
- **环境修正**：项目 Flake 位于 `nix/flake.nix`，使用 `nix develop ./nix -c ...` 后 CLI 为 `0.2.121`，WASM 版本阻塞已消除；未修改全局工具链或 Rust 依赖。
- **实现状态**：frontend-desktop 已交付 CodeMirror + 诊断适配 + iframe 分屏预览及旧预览删除；PM 集成补充删除 `desktop/src/app.tsx` 中的旧预览链接，`vite.config.ts` 保留 Mobile settings 改动。Product 静态路由同步移除旧预览映射并登记指南入口。
- **用户补充范围**：新增前端写死的编辑器使用指南。Admin 主导航只增加一个“指南”入口，页面内部按页签切换四组内容；不调用 API、不写入文章数据，也不出现在文章列表。编辑器标题区的“使用指南”在新标签页打开，避免中断当前编辑。
- **验收证据**：Nix shell 下标准 `lint`、`build`、`test:core` 通过（29 tests，287 native/WASM parity cases）；指南补充后标准 `typecheck`、`build`、定向 Oxlint/Biome 和 `git diff --check` 通过。Product 包全部测试通过，覆盖指南静态路由 200 与旧预览路由 404；构建产物包含指南且不含旧预览页。
- **当前阻塞**：真实浏览器的新建/编辑、中文光标定位、busy 只读、分屏同步、指南页签与发布失败路径由用户验收，尚未回填结果。计划保持 `in_progress`，Spec 不推进 `accepted`。

## 未决项

无。编辑器形态（CodeMirror + 分屏实时预览）、范围（仅编辑器）、独立预览页移除、WASM 唯一权威 + 适配层均为已定决策；CodeMirror 具体包版本、分屏比例 / 布局细节、防抖参数由 workstream 在实现中定并记录，不影响契约。执行中如需偏离上述已定决策，必须回用户确认。
