# 页面迁移台账

这份台账记录每个页面从旧入口到新 runtime 的完整替代面。页面只有在新入口、数据链路、状态、导航、测试和浏览器验收都完成后，才允许填写删除对象。

## 状态定义

- `inventory`：已盘点旧入口和消费者，尚未开始迁移。
- `building`：新 runtime 正在实现，旧入口继续作为当前生产入口。
- `verified`：新入口已接线并完成行为验收，准备删除旧实现。
- `deleted`：旧入口和无消费者模块已删除，删除后验证通过。

## 页面矩阵

| Page id | 平台/场景 | 当前入口 | 目标入口 | 数据与命令 | 当前状态 | 可删除对象 |
| --- | --- | --- | --- | --- | --- | --- |
| `desktop-public-home` | Desktop 公开首页 | `desktop/src/pages/public/home.tsx` | `app/bootstrap/desktop/home.tsx` | Desktop `tShelf` resource；类型筛选；文章详情语义导航 | `deleted` | 已删除旧页面和旧 shell |
| `desktop-public-articles` | Desktop 公开文章库 | `desktop/src/pages/public/articles.tsx` | `app/bootstrap/desktop/articles.tsx` | 文章列表 resource；筛选；详情导航 | `deleted` | 已删除旧页面及专属逻辑 |
| `desktop-public-detail` | Desktop 公开详情 | `desktop/src/pages/public/detail.tsx` | `app/bootstrap/desktop/detail.tsx` | 文章详情 resource；正文渲染；返回/文章库导航 | `deleted` | 已删除旧页面及专属逻辑 |
| `desktop-admin-login` | Desktop 管理登录 | `desktop/src/pages/admin/login.tsx` | `app/bootstrap/desktop/login.tsx` | 管理 session login；TOTP/恢复码；管理首页导航 | `deleted` | 已删除旧入口 |
| `desktop-admin-home` | Desktop 管理文章列表 | `desktop/src/pages/admin/home.tsx` | `app/bootstrap/desktop/admin-home.tsx` | 工作区文章 resource；版本化暂存下架；编辑/新建/发布工作台导航 | `deleted` | 已删除旧管理首页和旧 shell |
| `desktop-admin-article-preview` | Desktop 管理预览 | `desktop/src/pages/admin/article-preview.tsx` | `app/bootstrap/desktop/admin-preview.tsx` | 管理文章详情；HTML 校验状态；编辑/管理首页导航 | `deleted` | 已删除旧预览入口 |
| `desktop-admin-article-types` | Desktop taxonomy 发布工作台 | `desktop/src/pages/admin/taxonomy.tsx` | `app/bootstrap/desktop/taxonomy.tsx` | workspace、taxonomy save/analyze/review/preview/submit/abandon | `deleted` | 已删除旧 taxonomy 页面 |
| `desktop-admin-terms` | Desktop taxonomy 兼容入口 | `desktop/src/pages/admin/taxonomy.tsx` | `app/bootstrap/desktop/taxonomy.tsx` | 与 article-types 共享发布工作台 | `deleted` | 已删除旧 taxonomy 页面 |
| `desktop-admin-article-new` | Desktop 新建文章 | `desktop/src/pages/admin/new.tsx` | `app/bootstrap/desktop/editor-new.tsx` | workspace、文章保存、版本化写入、创建后切换编辑 URL；HTML/WASM 校验；session draft | `deleted` | 已删除旧 editor 入口和 query 依赖 |
| `desktop-admin-article-edit` | Desktop 编辑文章 | `desktop/src/pages/admin/edit.tsx` | `app/bootstrap/desktop/editor-edit.tsx` | 文章详情、workspace、版本化保存；HTML/WASM 校验；session draft | `deleted` | 已删除旧 editor 入口和 query 依赖 |
| `desktop-admin-editor-guide` | Desktop 编辑器指南 | `desktop/src/pages/admin/editor-guide.tsx` | `app/bootstrap/desktop/editor-guide.tsx` | 管理导航与编辑流程说明 | `deleted` | 已删除旧指南页面 |
| `mobile-admin-article-preview` | Mobile 管理预览 | `mobile/src/pages/admin-preview-content.tsx` | `app/bootstrap/mobile/admin-preview-content.tsx` | 管理预览 API；HTML 校验；预览状态 | `deleted` | 已删除旧预览入口及旧组件 |

所有当前 registry 页面都已登记在本表。没有登记在本表的页面不得标记为“可删除”。

## Desktop 公开首页切片

### 旧实现盘点

- 旧入口：`src/frontend/desktop/src/pages/public/home.tsx`（已删除）。
- 新入口：`src/frontend/app/bootstrap/desktop/home.tsx`。
- 数据链路：`app/habitat/desktop` 的 API、resource、logic 和语义导航。
- UI 依赖：旧 Desktop `shell/header.tsx`、`shell/t-shelf.tsx`、`desktop/styles.css`。
- 路由依赖：Desktop navigation adapter 和服务端 site-routes 清单。
- 行为状态：首次 loading、成功、空数据、失败重试、筛选切换时的竞态取消。

### 新实现必须覆盖

- `app/habitat/desktop` 的 API、T 型货架 resource、首页 logic、页面组件和语义导航。
- `app/bootstrap/desktop/home.tsx` 的浏览器宿主装配、路由清单加载和挂载。
- Desktop UI 组件只接收归一化数据和命令，不访问 API、storage 或 URL alias。
- 两个货架分别保持 `recommendation` 和 `archive` surface，筛选参数与旧请求一致。

### 删除前证据

- 新入口已替换 registry entry，旧入口不再被构建、脚本、测试或文档引用。
- 新旧实现的 API 请求、alias、筛选切换、空/错/重试状态对照完成。
- Desktop 公开首页完成真实 runtime 和浏览器验收。
- 删除旧文件后前端 typecheck、lint、核心测试、build 和相关 E2E 通过。

### 当前证据

- Desktop 首页、文章列表和详情已切换 registry 到新 bootstrap。
- 前端清理后的 typecheck、Oxlint、format check、41 项 runtime 测试和 Vite build 已通过。
- 清理后的浏览器 E2E 已在具备依赖的环境补跑通过（`playwright`/`playwright-core` 与 Chromium 就绪，产物 `target/e2e/1790817886941-81363/`；本行曾记录"当前环境没有 Chromium"，系当时快照，已被 PLAN.md 收尾记录取代）。

## 当前剩余工作

全部 registry 页面已切换到新 bootstrap；新编辑器已接通 workspace、详情读取、版本化保存、HTML/WASM 校验、CodeMirror 诊断定位和 session draft 恢复。旧运行链已删除。
