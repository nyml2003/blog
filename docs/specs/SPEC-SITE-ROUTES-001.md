---
kind: spec
id: SPEC-SITE-ROUTES-001
status: accepted
owner: frontend
created: 2026-09-09
last_reviewed: 2026-10-03
---

# 页面路由清单下发

## 目标

前端（页面与组件）不持有页面 URL 字面量；导航目标一律来自路由清单。清单的唯一事实源是 `src/frontend/pages.registry.ts`：`site-routes.json` 是它的生成物，Desktop 与 Mobile 均在构建期内嵌；`GET /api/public/site-routes` 端点保留，作为同源清单的外部消费面。

## 契约

- 事实源与生成物：`site-routes.json` 由 `src/frontend/page-registry/generate.ts` 从注册表生成，canonical 路由固定取每页 `aliases[0]`；在 vite 配置加载期自动同步（内容不变不写盘），也可用 `pnpm -C src/frontend run page:generate` 显式重新生成。
- 同步守卫：`src/frontend/tests/vite-plugins/page-template.test.ts` 将磁盘清单与生成器输出做逐字节比对；`ops page check`（CI build-release workflow 执行）复用同一校验器并检查清单漂移。
- 端点：`GET /api/public/site-routes`，sceneCode `public.site_routes`；Product 与 Mock 引用 protocol `include_str!` 内嵌的同一份清单，两侧保证一致。端点保留给外部消费与兼容场景，前端页面首绘不依赖它。
- 响应 `data`：`{ "routes": { "<page id>": "<path>" } }`；`page id` 与 `src/frontend/pages.registry.ts` 的页面 id 一致，`path` 必须是该页面已注册的 alias。
- 内嵌消费：Desktop 与 Mobile 的 bootstrap environment 在构建期内嵌同一份清单，用各自运行时的 `siteRoutesSchema` 校验后装配进页面 context；两端首绘不等待任何清单请求。
- 无会话依赖：端点登录前可获取。

## 前端消费规则

- 页面代码不出现路由 id 查询或 URL 字面量；条目级导航（文章详情、编辑）使用后端在数据响应中下发的 href，壳层导航（页头、底部导航、登录重定向）由壳层与基础设施经 `route()` 消费清单。
- API endpoint 字面量不属于本 Spec 范围：它们收敛在各端 foundation 的页面域 API 契约表并由 golden 测试锚定（见 `docs/api/routes.json`）。

## 场景

### 001 清单获取（端点保留）

Given 任意外部消费者请求 `/api/public/site-routes?sceneCode=public.site_routes`
When Product 或 Mock 处理请求
Then 响应 `data.routes` 覆盖全部注册页面 id，值为该页面的 canonical alias（`aliases[0]`）。

### 002 清单与注册表同步

Given `pages.registry.ts` 新增、改名页面或调整 alias 顺序
When vite 启动、`ops page check`、前端测试守卫或 CI 运行
Then 清单自动重新生成（vite 路径）；未提交重新生成结果的变更被逐字节比对守卫拦截。

### 003 内嵌引导失败

Given 构建产物中的内嵌清单不符合 `siteRoutesSchema`（生成链损坏或清单被篡改）
When 页面引导
Then 页面渲染错误状态与重试入口；不回退到任何前端字面量路径。

### 004 首绘零清单请求

Given 任一注册页面加载（Desktop 或 Mobile）
When 页面引导
Then 引导过程不发起 `/api/public/site-routes` 请求；e2e 对桌面旅程全程断言该请求不出现。

## 修订记录

- 2026-10-03（PLAN-PAGE-ONBOARDING-001）：清单从"git 跟踪的手工维护文件 + 测试集合守卫"改为"注册表生成物 + 逐字节比对守卫"；canonical 取值从人工挑选改为 `aliases[0]` 约定；Desktop 从运行时拉取改为构建期内嵌（对齐 Mobile，PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001 的先例），端点保留；场景 003 从"网络失败"改为"内嵌清单协议不符"，新增场景 004。
