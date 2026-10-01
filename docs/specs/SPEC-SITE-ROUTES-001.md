---
kind: spec
id: SPEC-SITE-ROUTES-001
status: accepted
owner: frontend
created: 2026-09-09
---

# 页面路由清单下发

## 目标

前端（页面与组件）不持有页面 URL 字面量；导航目标一律由后端下发。路由值只有一个运行时来源：`GET /api/public/site-routes`。

## 契约

- 端点：`GET /api/public/site-routes`，sceneCode `public.site_routes`；Product 与 Mock 引用 protocol 内嵌的同一份清单，两侧保证一致。
- 响应 `data`：`{ "routes": { "<page id>": "<path>" } }`；`page id` 与 `src/frontend/pages.registry.ts` 的页面 id 一致，`path` 必须是该页面已注册的 alias。
- 清单源文件：`src/frontend/site-routes.json`（受 git 跟踪），protocol 以 `include_str!` 编译期内嵌；与 `pages.registry.ts` 的同步由 `src/frontend/tests/vite-plugins/page-template.test.ts` 守卫。
- 无会话依赖：登录前可获取（登录页与 401 重定向依赖它）。

## 前端消费规则

- 旧页面由 `definePage`、新 Mobile 页面由 bootstrap environment 在渲染前完成清单引导；引导失败时页面渲染错误状态并允许重试，不用字面量兜底。
- 页面代码（`src/frontend/app/` 下的页面与 UI）不出现路由 id 查询或 URL 字面量；条目级导航（文章详情、编辑）使用后端在数据响应中下发的 href，壳层导航（页头、底部导航、登录重定向）由壳层与基础设施消费清单。
- API endpoint 字面量不属于本 Spec 范围：它们收敛在 `app/habitat/api` 的页面域 API 契约表并由 golden 测试锚定（见 `docs/api/routes.json`）。

## 场景

### 001 清单获取

Given 任一前端页面加载
When 引导层请求 `/api/public/site-routes?sceneCode=public.site_routes`
Then 响应 `data.routes` 覆盖全部注册页面 id，值为该页面的注册 alias。

### 002 清单与注册表同步

Given `pages.registry.ts` 新增或改名页面
When 质量门禁运行
Then `page-template.test.ts` 因 `site-routes.json` 未同步而失败。

### 003 引导失败

Given 清单请求失败（网络错误或 5xx）
When 页面引导
Then 页面不渲染导航，显示错误状态与重试入口；不回退到任何前端字面量路径。
