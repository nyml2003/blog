---
kind: spec
id: SPEC-DESKTOP-EDITOR-001
status: draft
owner: frontend-desktop
plan_id: PLAN-DESKTOP-EDITOR-001
last_reviewed: 2026-09-06
---

# B Desktop 文章编辑器升级（CodeMirror + 分屏实时预览）

## 目标

将 Admin 创作端 new/edit 共用的文章编辑器从裸 textarea 升级为 CodeMirror v6 源码编辑 + 同页分屏实时预览，实现“边写边看”。HTML 解析与校验的唯一权威保持为 Rust HTML profile 的 WASM 实现，新增 CodeMirror 适配层只做位置映射与诊断展示。独立预览页及其 sessionStorage 中转随之移除。

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
- **独立预览移除**：`/admin/articles/preview.html` 入口、`preview.tsx`、`preview-cache.{ts,test.ts}` 与 vite 注册一并删除；`test:core` 不再引用 preview-cache 测试。

## 场景

### SPEC-DESKTOP-EDITOR-001-001

Given 用户打开新建或编辑文章页

Then 正文编辑区是 CodeMirror v6（HTML 语法高亮、行号、自动缩进），元数据栏（标题 / 类型 / 摘要 / 标签）与保存 / 发布 / 取消发布操作的位置和行为不变

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

Given 升级后的工作区

Then 不存在 `/admin/articles/preview.html` 页面、跳页预览按钮与 preview-cache 中转

And `test:core` 不再包含 preview-cache 测试，构建产物不含该入口

### SPEC-DESKTOP-EDITOR-001-007

Given 保存 / 发布请求进行中（busy）

Then 编辑器进入只读（保留可视内容与诊断），操作按钮禁用，请求完成后恢复

And CodeMirror 可经键盘聚焦与操作，屏幕阅读器对校验状态的播报不劣于现状

## 边界与失败

- WASM 模块加载失败：编辑器可输入，校验状态显示失败可重试（沿用现状语义），发布按钮因无法确认 `valid` 而禁用。
- 超长文档性能：防抖间隔与 CodeMirror 增量解析保证可用性；如出现性能问题，调防抖参数而不是去掉 WASM 权威。
- 分屏渲染的资源加载（图片等外链）按浏览器默认行为，不做代理或改写。
- CodeMirror 依赖新增进 `src/frontend/package.json`，版本由 workstream 锁定并记录。

## 测试/验收证据

- 自动化测试：`desktop/src/pages/admin/editor-codemirror.test.ts` 覆盖中文与 emoji 多字节诊断跨度映射、待校验状态；与 `common/validation/article-html.test.ts` 合计 9 tests 通过。桌面编辑器相关 Oxlint 通过；全量 typecheck 当前被 `mobile-ui/atoms/define.ts` 既有错误阻断。
- PM 集成验证：`nix develop ./nix -c pnpm --dir src/frontend test:core` 29 tests + 287 native/WASM parity cases 通过；同环境标准 build/lint 通过，本计划 Desktop 文件 Biome 检查通过；源码扫描与构建产物均无旧预览入口。标准 typecheck 仍由 `mobile-ui/atoms/define.ts:48` TS2345 阻断，Spec 保持 draft。
- 人工验收：待补充（新建 / 编辑全流程、中文文档编辑与诊断定位、分屏同步流畅度、发布门禁、preview 页面确实移除）。
