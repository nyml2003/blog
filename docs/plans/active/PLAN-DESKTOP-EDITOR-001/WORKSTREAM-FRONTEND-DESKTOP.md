---
kind: workstream
id: WORKSTREAM-FRONTEND-DESKTOP
status: in_progress
plan_id: PLAN-DESKTOP-EDITOR-001
role: frontend-desktop
owner: frontend-desktop
depends_on: []
write_set:
  - src/frontend/package.json
  - src/frontend/pnpm-lock.yaml
  - src/frontend/desktop/src/pages/admin/editor.tsx
  - src/frontend/desktop/src/pages/admin/html-inspection.tsx
  - src/frontend/desktop/src/pages/admin/editor-codemirror.ts
  - src/frontend/desktop/src/pages/admin/editor-preview.tsx
  - src/frontend/desktop/src/pages/admin/editor-codemirror.test.ts
  - src/frontend/desktop/src/pages/admin/editor-guide.tsx
  - src/frontend/desktop/pages/admin-editor-guide/index.html
  - src/frontend/desktop/src/app.tsx
  - src/frontend/desktop/src/styles.css
  - src/frontend/common/validation/article-html.ts
  - src/frontend/vite.config.ts
  - docs/specs/SPEC-DESKTOP-EDITOR-001.md
  - docs/plans/active/PLAN-DESKTOP-EDITOR-001/
last_reviewed: 2026-09-06
---

删除写集（同为本工作流独占）：

- `src/frontend/desktop/src/pages/admin/preview.tsx`
- `src/frontend/desktop/src/pages/admin/preview-cache.ts`
- `src/frontend/desktop/src/pages/admin/preview-cache.test.ts`
- `src/frontend/desktop/pages/admin-article-preview/`

# 工作流：前端（desktop）编辑器升级

## 目标

实现 [SPEC-DESKTOP-EDITOR-001](../../../../specs/SPEC-DESKTOP-EDITOR-001.md) 全部场景：CodeMirror v6 编辑区、WASM 诊断适配层、分屏实时预览、独立预览移除。

## 输入

- Spec：`SPEC-DESKTOP-EDITOR-001`；
- 现状接线：`editor.tsx`（textarea + `useHtmlInspection` + `HtmlDiagnostics` + `locate`）、`common/validation/wasm.ts` 的 `inspectHtml`、`common/validation/article-html.ts` 的字节偏移类型与 `byteOffsetToSelection`、`vite.config.ts` 的 MPA 注册、`package.json` 的 `test:core` 脚本。

## 输出

- `editor-codemirror.ts`：CodeMirror 装配（`@codemirror/state/view/language/lint/lang-html` + 主题与基础键位）与适配层——`HtmlDiagnostic`（UTF-8 字节偏移）→ CodeMirror 位置 / lint 诊断的映射纯函数 + 集成；`lang-html` 仅高亮，不产生诊断；
- `editor-preview.tsx`：分屏预览组件（iframe 沙箱 + 与前台一致的正文样式，防抖同步）；
- `editor.tsx`：textarea 替换为 CodeMirror，`html` signal 与 CM 文档双向同步（单向数据流优先，避免回环），busy → 只读，`locate` 改为 CM 定位；
- 字节偏移 → 位置映射：落在可单测纯函数（必要时在 `common/validation/article-html.ts` 导出共享换算），多字节边界有测试；
- 删除 preview 页 / 跳页按钮 / `preview-cache`，`vite.config.ts` 移除 alias 与 input，`test:core` 移除 preview-cache.test.ts；
- `styles.css` 增加分屏与 CodeMirror 容器样式（不重构既有样式）；
- `package.json` 锁定 CodeMirror 依赖版本并记录。
- `editor-guide.tsx`：前端静态使用指南；一个 Admin 导航入口，页面内部用页签切换快速开始、正文格式、校验与预览、保存与发布，不读取或写入文章 API；
- `app.tsx`、`vite.config.ts`：注册指南导航与独立 HTML 入口；编辑器标题区提供新标签页指南链接。

## 实施任务

1. 引入 CodeMirror 依赖，装配最小编辑器替换 textarea（信号同步、只读态、焦点管理）；
2. 适配层：映射纯函数 + 单测（多字节边界），lint 槽位 / 行内标记 / 诊断列表点击定位，接入 `useHtmlInspection` 既有防抖与取消；
3. 分屏预览组件 + 防抖同步 + 样式；
4. 移除独立预览页与 preview-cache（vite、test:core、editor 内引用）；
5. 文档与证据：Spec 场景证据回填。
6. 增加静态编辑器指南、Admin 导航和编辑器内入口，不接入后端或文章列表。

依赖顺序 1 → 2 → 3 → 4 → 5；2 完成前发布门禁以现有 `valid()` 逻辑为准不放松。

## 测试/验收

- 单测：映射纯函数（ASCII / 中文 / emoji 边界）、适配层诊断转换、editor 集成冒烟；
- `pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿；
- 人工：新建 / 编辑全流程、长中文文档诊断定位、分屏同步、发布门禁、preview 入口确认 404（或构建产物无此页）。

## 阻塞

- 真实浏览器交互验收待补齐，不能以编译和纯函数测试代替。

## 交付记录

- 2026-09-06：新增 CodeMirror 6（`@codemirror/commands` 6.8.1、`@codemirror/lang-html` 6.4.9、`@codemirror/lint` 6.8.5、`@codemirror/state` 6.5.2、`@codemirror/view` 6.36.5），编辑器支持 HTML 高亮、行号、Tab 缩进和 busy 只读。
- 2026-09-06：新增 `editor-codemirror.ts` 适配层与 `editor-codemirror.test.ts`，UTF-8 字节偏移经共享 `byteOffsetToSelection` 映射为 CodeMirror UTF-16 范围；诊断进入 lint 标记并支持定位，列表诊断保留。
- 2026-09-06：新增 `editor-preview.tsx`，通过空 `sandbox` iframe 防抖渲染正文；移除独立预览页、缓存模块、MPA 路由和 `test:core` 旧测试条目。
- 2026-09-06：定向 `editor-codemirror` 与 HTML 校验测试通过（9 tests）；桌面相关 Oxlint 通过。全量 typecheck 仍受并行 Mobile 文件 `mobile-ui/atoms/define.ts` 既有错误阻断，WASM 构建门禁尚未重跑。
- 2026-09-06 PM 集成：使用项目 `nix develop ./nix` 消除 WASM CLI 版本错配；标准 build/lint/test:core 通过，test:core 为 29 tests + 287 native/WASM parity cases。本计划 Desktop 文件 Biome 检查通过。删除 `desktop/src/app.tsx` 的旧预览链接，旧入口引用扫描为空，构建产物无 preview 页。
- 2026-09-06 用户补充：新增静态编辑器使用指南及四个内部页签；入口接入 Admin 主导航和编辑器标题区，内容全部在 Desktop TS 中定义，不调用 API、不持久化，也不进入文章列表。
- 2026-09-06 指南检查：标准 typecheck 与 build 通过，指南入口进入构建产物；定向 Oxlint、Biome 与 `git diff --check` 通过。浏览器交互由用户验收。
