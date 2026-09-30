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
| `desktop-public-home` | Desktop 公开首页 | `desktop/src/pages/public/home.tsx` | `app/bootstrap/desktop/home.tsx` | Desktop `tShelf` resource；类型筛选；文章详情语义导航 | `building` | 旧首页、Desktop 旧 Header/T 型货架中仅由首页使用的部分 |
| `desktop-public-articles` | Desktop 公开文章库 | `desktop/src/pages/public/articles.tsx` | `app/bootstrap/desktop/articles.tsx` | 文章列表 resource；筛选；详情导航 | `building` | 旧文章库入口及专属逻辑 |
| `desktop-public-detail` | Desktop 公开详情 | `desktop/src/pages/public/detail.tsx` | `app/bootstrap/desktop/detail.tsx` | 文章详情 resource；正文渲染；返回/文章库导航 | `building` | 旧详情入口及专属逻辑 |
| `mobile-admin-article-preview` | Mobile 管理预览 | `mobile/src/pages/admin-preview-content.tsx` | `app/bootstrap/mobile/admin-preview-content.tsx` | 管理预览 API；HTML 校验；预览状态 | `inventory` | 旧预览入口及专属旧组件 |

其余 Desktop 管理页面和剩余旧 Mobile 页面在公开页面切片完成后补入本表。没有登记在本表的页面不得标记为“可删除”。

## Desktop 公开首页切片

### 旧实现盘点

- 入口：`src/frontend/desktop/src/pages/public/home.tsx`。
- 页面引导：`src/frontend/solid/page.tsx`。
- 数据查询：`src/frontend/solid/queries/shelves.ts` 的 `useTShelf`，通过旧 `common/client` 和 `common/data` 请求两个 T 型货架。
- UI 依赖：旧 Desktop `shell/header.tsx`、`shell/t-shelf.tsx`、`desktop/styles.css`。
- 路由依赖：旧 `solid/queries` 暴露的 `publicHomeHref`、`publicArchiveHref`、`publicArticleDetailHref`。
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
