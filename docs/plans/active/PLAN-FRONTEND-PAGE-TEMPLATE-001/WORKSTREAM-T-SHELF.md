---
kind: workstream
id: WORKSTREAM-T-SHELF
status: completed
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
role: frontend-backend
owner: frontend
depends_on:
  - WORKSTREAM-REGISTRY
  - PLAN-ARCH-BOUNDARY-001/WORKSTREAM-BACKEND
write_set:
  - src/frontend/solid/queries/
  - src/frontend/desktop/src/
  - src/frontend/desktop/src/styles.css
  - src/frontend/mobile/src/
  - src/frontend/mobile/styles/
  - src/backend/product/
  - src/backend/mock/
  - src/core/protocol/
  - docs/specs/SPEC-FRONTEND-T-SHELF-001.md
  - docs/plans/active/PLAN-FRONTEND-PAGE-TEMPLATE-001/
last_reviewed: 2026-09-07
---

# 公开端 T/F 货架归一

## 目标

Mobile 文章 list 页及其二级页继续使用既有 F 型浏览；其余公开展示货架统一采用 T 型筛选与文章区布局。T 型货架由服务端返回筛选语义，页面通过统一查询层请求并处理切换竞态。

## 输入

- `SPEC-FRONTEND-T-SHELF-001`；
- `SPEC-MOBILE-BROWSE-IA-001` 的既有 F 型契约；
- `PLAN-ARCH-BOUNDARY-001` 的 Product BFF、protocol 与前端查询层边界。

## 输出

- Product 与 Mock Product 对齐的 T 型货架 API；
- `src/frontend/solid/queries/` 的查询状态与取消/忽略旧请求机制；
- Desktop 公开货架和 Mobile 首页的 T 型界面；
- Mobile `/m/articles/index.html` 与 `/m/articles/list.html` 的 F 型回归证据。

## 实施任务

1. 建立 T 型货架请求/响应契约：初始请求返回完整筛选项和首个筛选项的文章数据，切换请求按筛选标识返回文章数据；
2. 将读取、加载、失败、空态、重试和竞态控制归入查询层；
3. Desktop 首页、Desktop 文章页和 Mobile 首页接入 T 型货架；
4. 保持 Desktop/Mobile DOM、CSS 与组件实现隔离，只共享无 UI 查询与契约；
5. 验证 Mobile 两个 F 型页面的层级、筛选、滚动定位与加载更多不回归。

## 测试/验收

- API 契约与 Product/Mock 对齐测试；
- 查询层初始请求、切换、失败、重试、空态与旧请求晚到测试；
- Desktop/Mobile 浏览器自动化覆盖 T 型布局和 F 型回归；
- 最终产品验收由用户执行。

## 阻塞

- 页面入口文件须在 `WORKSTREAM-REGISTRY` 完成并交接后再修改；
- 后端路由与 DTO 须在 ARCH 后端工作流交接后接入。

## 交付记录

- 2026-09-07：用户确认 T/F 适用范围和 T 型数据加载方式，工作流启动。
- 2026-09-07：Product 与 Mock 新增 `GET /api/public/t-shelf`（`public.t_shelf`），支持 `recommendation` / `archive` 两类 surface；初始请求默认 `all` 并同时返回完整 filters 与文章，切换按 `filter_id` 重取文章。
- 2026-09-07：Desktop 首页、Desktop 文章页与 Mobile 首页完成独立 T 型实现；Mobile `/m/articles/index.html` 和 `/m/articles/list.html` 保持既有 F 型结构。查询层覆盖 loading / error / empty / retry，并以取消和 generation guard 防止旧响应覆盖新选择。
- 2026-09-07：Product→Data、Product/Mock API 契约、前端 client 与查询竞态测试通过；前端 typecheck、lint、format、76 项核心测试与 build 通过；Desktop/Mobile 代表视口浏览器走查覆盖筛选重请求、重渲染、错误重试、空态、F 型回归及无横向溢出。
- 2026-09-07：代码与自动化验收完成；最终视觉和产品验收由用户执行。
