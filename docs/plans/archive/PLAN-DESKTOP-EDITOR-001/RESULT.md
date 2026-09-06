---
kind: plan-result
id: RESULT-DESKTOP-EDITOR-001
plan_id: PLAN-DESKTOP-EDITOR-001
status: completed
owner: project-manager
completed: 2026-09-07
---

# B Desktop 文章编辑器升级结果

## 结果

已完成 Admin 文章编辑器的 CodeMirror v6 源码编辑、WASM 诊断适配、源码与简版预览分屏、静态使用指南，以及已保存版本的 Desktop / Mobile 端到端阅读预览。Mobile 端到端入口最终调整为直接挂载固定 375px Mobile 阅读页，移除误引入的 Desktop 管理台外壳和 iframe。

编辑器指南使用前端写死的 HTML 字符串；每个页签由同一份字符串同时驱动源码区和预览区，不请求 API、不写文章数据，也不进入文章列表。已保存版本预览只读取服务端文章和权威 `htmlInspection`，无效或缺失校验结果不会将正文交给 `ArticleBody`。

## 验证证据

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| CodeMirror 编辑与多字节诊断定位 | `editor-codemirror.test.ts`、`editor-state.test.ts`、WASM parity cases | 通过 |
| 前端质量门禁 | `nix develop ./nix -c pnpm --dir src/frontend typecheck`、`lint`、`test:core`、`build` | 通过；48 tests + 287 native/WASM parity cases |
| Product 静态路由和文章契约 | `nix develop ./nix -c cargo test -p product --manifest-path src/Cargo.toml` | 通过；14 unit、1 chain、2 contract、1 residency |
| 预览入口 | 同源 `ops runtime integration`，Product 实际绑定 `127.0.0.1:8082`，Data 绑定 `127.0.0.1:8081` | 编辑器、指南、Desktop / Mobile 入口 200；旧 `/admin/articles/preview.html` 404 |
| 用户浏览器验收 | 用户实际检查编辑器输入、指南页签和 Desktop / Mobile 端到端预览，并报告 Mobile 外壳重复问题 | 问题已修复，用户确认可归档 |
| 差异完整性 | `git diff --check` | 通过 |

## 生效变化

- Desktop Admin 编辑页上方为表单，下方为可输入的 CodeMirror 源码和右侧简版预览。
- 端到端预览从编辑器操作区进入，使用最后一次保存的服务端版本；草稿和已发布文章均可预览。
- Desktop 预览使用 Desktop 阅读页；Mobile 预览直接使用 Mobile 阅读页并限制为 375px 宽度。
- 旧 sessionStorage 预览页、旧跳页按钮和 `preview-cache` 已移除。
- Admin 新增静态编辑器指南入口，指南内容不产生后端数据。

## 证据边界

- 计划归档依据包含用户完成的浏览器交互验收；本结果不把浏览器观察扩写为像素级自动化证据。
- 未修改 `docs/FACTS.md`，未改变 Rust HTML profile / WASM 校验语义或公共 API 契约。

## 归档记录

2026-09-07，用户确认实现可以归档。计划、工作流、结果记录整体移入 `docs/plans/archive/PLAN-DESKTOP-EDITOR-001/`；Spec 标记为 `accepted`，计划索引更新为最近归档。
