---
kind: spec
id: SPEC-DESKTOP-EDITOR-001
status: accepted
owner: frontend-desktop
plan_id: PLAN-DESKTOP-EDITOR-001
last_reviewed: 2026-09-07
---

# B Desktop 文章编辑器升级（CodeMirror + 分屏预览 + 已保存版本预览）

## 目标

将 Admin 创作端 new/edit 共用的文章编辑器从裸 textarea 升级为 CodeMirror v6 源码编辑 + 同页分屏实时预览，实现“边写边看”。元数据表单位于编辑器上方，源码和简版预览位于下方。HTML 解析与校验的唯一权威保持为 Rust HTML profile 的 WASM 实现，新增 CodeMirror 适配层只做位置映射与诊断展示。

编辑器还提供已保存版本的端到端预览：草稿与已发布文章均可选择 Desktop 或固定 375px 的 Mobile 阅读页面查看。旧的 sessionStorage 中转预览入口移除。

## 非目标

- 不做富文本（ProseMirror/TipTap 类）直接编辑，创作模型保持手写 HTML 源码；
- 不做自动保存 / 防丢稿 / 快捷键体系（已被用户明确排除在本计划外）；
- 不打磨 Admin 文章列表、taxonomy 等其他页面；
- 不修改 Rust HTML profile 与 WASM 校验语义、不修改后端接口；
- 不重构 Desktop CSS 模块化（样式仍进现有 `styles.css`）；
- 不引入 Desktop 主题切换（与 C Mobile 主题计划无关）。

## 契约

- **校验唯一权威**：诊断只来源于 `inspectHtml`（Rust profile → WASM，经 `common/validation/wasm.ts`）；`@codemirror/lang-html` 等仅提供高亮 / 缩进 / 折叠，不得成为诊断来源，不做 JS 侧二次解析。
- **适配层**：`HtmlDiagnostic` 的字节偏移（UTF-8）必须映射为 CodeMirror 位置后再进入 lint 展示；多字节中文内容的映射必须正确（复用 / 既有 `byteOffsetToSelection` 同源的换算逻辑，落在可单测的纯函数）。
- **分屏预览**：左侧 CodeMirror 源码、右侧同页渲染；输入经防抖同步；渲染在隔离容器（iframe 沙箱）中以与前台正文一致的样式呈现。预览尽力渲染，不承担门禁职责。
- **发布门禁不变**：`valid()` 仍完全由 WASM 校验结果决定；校验无效时“保存并发布”禁用，行为与现状一致。
- **防抖与取消**：沿用 `useHtmlInspection` 的任务取消与结果陈旧性判定（`source` 比对），不得出现旧结果覆盖新输入。
- **端到端预览**：`/admin/articles/preview.html`、`preview.tsx`、`preview-cache.{ts,test.ts}` 与 vite 注册一并删除；`test:core` 不再引用 preview-cache 测试。已加载的已保存文章，或刚成功保存 / 发布的文章，在表单、源码无未保存修改且服务端权威校验通过时，编辑器操作区提供端到端预览菜单，选择 `/admin/articles/preview/desktop.html?id={id}` 或 `/admin/articles/preview/mobile.html?id={id}`。Desktop 入口渲染 Desktop 阅读页；Mobile 入口直接渲染固定 375px 的 Mobile 阅读页，不再包裹 Desktop 管理台或 iframe。预览读取 API 返回的已保存文章和权威 `htmlInspection`；缺失或无效时不得渲染 `ArticleBody`。

## 场景

### SPEC-DESKTOP-EDITOR-001-001

Given 用户打开新建或编辑文章页

Then 页面上半部为标题、类型、摘要和主题/标签表单；下半部为 CodeMirror v6（HTML 语法高亮、行号、自动缩进）与简版分屏预览，保存 / 发布 / 取消发布操作的位置和行为不变

And 含中文等多字节字符的文档，光标移动、选择、编辑均正确

### SPEC-DESKTOP-EDITOR-001-002

Given 用户在编辑器中输入正文

When 输入停顿达到防抖阈值

Then 触发一次 WASM `inspectHtml`，期间任务可被新输入取消，旧结果不覆盖新输入

And 正在校验 / 校验失败可重试的状态提示保留（`aria-live` 行为不回归）

### SPEC-DESKTOP-EDITOR-001-003

Given WASM 校验返回带字节偏移的诊断

Then 诊断在 CodeMirror 中以 lint 标记（行内 / 槽位）与诊断列表双形态呈现

When 用户点击任一诊断

Then 编辑器定位并选中对应源码区间，映射在多字节内容上准确

### SPEC-DESKTOP-EDITOR-001-004

Given 用户正在编辑正文

Then 右侧分屏在防抖后以与前台一致的正文样式渲染当前 HTML

And 源码校验无效不阻塞预览渲染，但“保存并发布”保持禁用（预览不是门禁）

### SPEC-DESKTOP-EDITOR-001-005

Given 任意编辑状态

When 保存 / 保存并发布 / 取消发布

Then 与升级前相同的成功与失败行为（含服务端 html-validation 失败回填诊断），不因编辑器替换而回归

### SPEC-DESKTOP-EDITOR-001-006

Given 已保存且正文校验通过的文章，表单和源码均无未保存修改

When 用户在编辑器操作区打开“端到端预览”并选择 Desktop 或 Mobile

Then 系统分别打开对应阅读页；页面显示已保存版本、文章状态和“返回编辑”，Mobile 容器宽度固定为 375px

And 草稿与已发布文章都可以预览；`/admin/articles/preview.html`、旧跳页预览按钮与 preview-cache 中转不存在，`test:core` 不再包含 preview-cache 测试

### SPEC-DESKTOP-EDITOR-001-009

Given 端到端预览请求到不存在文章、缺少 `htmlInspection` 或 `htmlInspection.valid` 为 false 的结果

Then 阅读页面显示不可见状态，且不将 `contentHtml` 传给 `ArticleBody`

### SPEC-DESKTOP-EDITOR-001-007

Given 保存 / 发布请求进行中（busy）

Then 编辑器进入只读（保留可视内容与诊断），操作按钮禁用，请求完成后恢复

And CodeMirror 可经键盘聚焦与操作，屏幕阅读器对校验状态的播报不劣于现状

### SPEC-DESKTOP-EDITOR-001-008

Given 用户需要了解编辑器的正文格式与操作流程

Then Admin 主导航提供一个“指南”入口，指南页面通过一个页签区呈现快速开始、正文格式、校验与预览、保存与发布；每一页复用 `section.editor-source`，左侧源码与右侧预览都读取同一份前端静态 HTML 字符串

And 指南内容与 HTML 示例全部由 Desktop 前端静态定义，不请求文章 API、不写入后端，也不出现在文章列表

When 用户从编辑器标题区打开“使用指南”

Then 指南在新标签页打开，当前编辑页和未保存输入保持原位；用户可在指南中编辑示例，切换页签后当前示例恢复初始字符串

## 边界与失败

- WASM 模块加载失败：编辑器可输入，校验状态显示失败可重试（沿用现状语义），发布按钮因无法确认 `valid` 而禁用。
- 超长文档性能：防抖间隔与 CodeMirror 增量解析保证可用性；如出现性能问题，调防抖参数而不是去掉 WASM 权威。
- 分屏渲染的资源加载（图片等外链）按浏览器默认行为，不做代理或改写。
- CodeMirror 依赖新增进 `src/frontend/package.json`，版本由 workstream 锁定并记录。

## 测试/验收证据

- 自动化测试：`desktop/src/pages/admin/editor-codemirror.test.ts` 覆盖中文与 emoji 多字节诊断跨度映射、待校验状态；`editor-state.test.ts` 覆盖编辑快照的空白与标签排序边界。`test:core` 共 48 tests + 287 native/WASM parity cases 通过，桌面编辑器相关 Oxlint 通过。
- PM 集成验证：`nix develop ./nix -c pnpm --dir src/frontend typecheck`、`lint`、`test:core`、`build` 全部通过；构建产物包含指南、Desktop 预览和 Mobile 阅读内页。Product 静态路由单测与 HTTP 契约覆盖三个新预览入口和旧预览路由 404。`git diff --check` 通过。
- 人工验收：用户已完成新建 / 编辑、中文文档编辑、分屏预览、指南页签、草稿与已发布文章的 Desktop / Mobile 预览检查；发现 Mobile 入口误包裹 Desktop 外壳的问题，已修复并通过更新后的同源 integration 入口复核。发布门禁与不可渲染无效正文保持由自动化契约覆盖。Spec accepted。
