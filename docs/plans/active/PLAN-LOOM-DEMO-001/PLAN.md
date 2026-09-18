---
kind: plan
id: PLAN-LOOM-DEMO-001
status: ready
owner: project-manager
created: 2026-09-11
last_reviewed: 2026-09-11
---

# Mock 网络适配器 + 薄请求器 + 生命周期 demo 页面（第五期）

## 定位

生命周期的第一个**前端页面消费者**（2026-09-11 用户拍板：vanilla 渲染 + mock network 数据源）。探索确认：仓库 TS 侧无 HTTP server 先例、`packages/node` 文档化零 `node:http` 纪律——故用 NetworkPort 的第三个适配器（内存 mock）而非真起 server；请求器做 port 组合子（参考 blog `app/habitat/api/mobile/client.ts` 形状砍到最薄）。

状态分层预演 blog settings 真实形态：`restore`（同步）走 localStorage 缓存 → `reconcile` 走 GET `/settings`（服务端权威）→ 写入走 POST `/settings`（乐观 → 回滚 → 重试）。

## 交付

| 件 | 位置 | 说明 |
| --- | --- | --- |
| `@fluvient-loom/mock` | `packages/mock` | `createMockNetwork(routes, { scheduler })`：精确路由、未匹配 404（业务级）、`delayMs`（注入 scheduler）、传输失败透传、`hang`（配合 timeoutMs 演超时）、取消短路。中立零平台 |
| `createJsonRequester` | `packages/port/src/requester.ts` | get/post/delete 消 `NetworkRequest` 五字段样板，Result 原样透传（envelope/zod 归接入层）；port 包首个运行时 + 测试 |
| `createWebOperationId` | `packages/web` | `crypto.randomUUID` 默认 + 注入，对称 node 包 |
| `apps/playground` | demo 消费者，不进 scope、不放 `packages/`（护栏天然不扫） | `src/lifecycle.ts` 纯端口组装（node 可测）：mock 服务端（GET/POST `/settings`、`failNextPut` 注入 500、`replace` 演服务端变更）+ 工厂装配（project 内缓存穿透 + 可选 DocumentPort 投影）；`src/main.ts` DOM 粘合；`index.html` 主题/字体 Select + 失败横幅 + 重试 + 失败开关 |

设施：workspace 增 `apps/*`；root tsconfig include 增 playground；`ops package check` 零改动（`pnpm -r` 自动纳入、护栏只扫 `packages/*/src`）。

## 验收（2026-09-11 达成）

1. mock 单测 6/6（命中 / 404 / 传输失败 / 取消短路 / 延迟 / hang）；
2. requester 单测 4/4（样板填充 / body+headers / 缺省 idle signal / Result 透传）；
3. playground 生命周期测试 5/5：冷启 restore 默认 → 写入直达服务端并驻留 → 注入 500 回滚到服务端真相 → 重试 settle → 服务端直改被 reconcile 采纳 → 新 app 从缓存 restore（刷新语义）；
4. 全 workspace 八包测试全绿 + `ops package check` 双绿 + blog `test:core` 零回归；
5. 手玩：`pnpm -C apps/playground dev`（端口 5174）浏览器走完 demo 故事。

## 改版（2026-09-11 同日，用户拍板：demo 弃 settings，改移动端三页流）

demo 页面重构为**首页推荐 → 查看更多 → 列表 → 点卡片 → 详情**（仅移动端），特点全占：

- **导航骑 `NavigationPort`**（`createWebNavigation` 的 push/popstate）——手写迷你视图栈，push 带 `{ frame: n }` 帧号（"栈≡日志折叠"的迷你版），系统返回手势走同一条路，栈底 pop 静默；
- **视图 DOM 保活**（display 切换不销毁）——从详情返回列表滚动原样（0 渲染，保活池理念的迷你预演）；惰性首渲染 + 详情按 id 单次拉取（DataTask）；
- **数据全走 mock 服务端**：`/recommendations`、`/articles`、`/articles/:id`（mock 包本期补 `:param` 路由段匹配，query 串不参与匹配）；
- **详情收藏 = 完整生命周期**：restore（localStorage）→ reconcile（GET `/favorites`，服务端默认收藏 #4）→ 乐观点亮 → POST `/favorites` 全量写入 → "下次收藏失败"开关注入 500 → 回滚 + 横幅 + 重试。

文件形态：`src/server.ts`（数据+路由）、`src/app.ts`（装配+收藏生命周期+读函数）、`src/nav.ts`（迷你栈）、`src/pages.ts`（HTML 模板）、`src/main.ts`（DOM/导航粘合）、`test/{app,nav}.test.ts`（注入式 7 用例）。

## 非目标

- 不做 solid / signal 镜像与 blog 接入（另立项）；
- 不做真 HTTP server（node:http）与 envelope/zod 解码（接入期）；
- 不做真导航运行时（帧号快照/槽/池归 PLAN-PAGE-RUNTIME-001，demo 迷你栈只占位）；
- 不碰 `src/frontend`。
