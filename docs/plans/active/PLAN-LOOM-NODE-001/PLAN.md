---
kind: plan
id: PLAN-LOOM-NODE-001
status: ready
owner: project-manager
created: 2026-09-11
last_reviewed: 2026-09-11
---

# @fluvient-loom/node：Node 宿主适配包

## 定位

`PLAN-LOOM-DATA-001` 的第二期（一期四包 2026-09-11 验收通过后立项）。命题（用户原话）："类似 ionic 的基建，不能依赖 node，比如 node 的 fetch"、"先做一个 node 适配，不能让 node 占了 infra 的名字"。

包结构裁定（2026-09-11）：**每宿主一个适配包**（capacitor 式）——`@fluvient-loom/node` 锁定 Node 宿主，`@fluvient-loom/web` 将来锁定浏览器（归 `PLAN-PAGE-RUNTIME-001`）；**不设立 `infra` 这个"默认实现包"名目**，避免任何单一宿主占用通用名。

宿主适配的铁律：内核（port / common / query / command）不认识任何宿主；适配包把宿主提供的能力（Node 提供的是它实现了的 Web 标准：`fetch` / `AbortController` / `queueMicrotask` / `setTimeout` / `crypto.randomUUID`）**适配成端口**。`node:*` 模块、undici、`node:http` 一行不进——因此同一逻辑在浏览器与 node 语义一致，node 下可直接测（data: URL 真 fetch 往返，零网络零 mock）。

## 包清单（本期交付）

| 导出 | 兑现的端口 | 默认 | 可注入覆盖 |
| --- | --- | --- | --- |
| `createNodeNetwork` | NetworkPort（port 包本期补入该契约） | 全局 `fetch` + 标准定时器；JSON 编解码、`CancellationSignal` → `AbortController`、timeout、失败分型（network / timeout / protocol / cancelled） | `fetcher` / `setTimeoutFn` / `clearTimeoutFn` |
| `createNodeScheduler` | SchedulerPort | `queueMicrotask` / `setTimeout`；Node 无 rAF → `animationFrame` 降级 `setTimeout(cb, 0)` | 全部四个定时入口 |
| `createNodeOperationId` | OperationIdPort | `crypto.randomUUID` | `randomUUID` |
| `createMemoryPersistence` | PersistencePort + AsyncPersistencePort | 纯内存 Map（零平台能力，中立；第二个宿主需要同款时再迁共享包） | — |

依赖链：`node → port + common`，与 query / command 平级零耦合。

## 工作流

| 步 | 内容 | 验证 |
| --- | --- | --- |
| N1 port 补契约 | network.ts 五类型映射进 port 包 | typecheck 绿 |
| N2 node 包 | 四件适配实现 | typecheck 绿 |
| N3 宿主测试 | data: URL 真往返；取消 / 超时 / 协议 / 网络四类失败注入 fake fetcher 与可控定时器；scheduler 真调度 + rAF 注入与降级；uuid 格式；内存持久化往返 | 全绿 |
| N4 门禁与验收 | `ops package check` 全绿；blog 零回归 | 验收四项 |

## 验收

1. `packages/node/src` 零 `node:` import、零平台成员访问（护栏自动覆盖，与内核包同规）；
2. fetch 适配在 node 下用**真全局 fetch**（data: URL）完成请求-响应往返；
3. 注入路径齐备（fake fetcher / 可控定时器 / rAF 覆盖），缺失标准能力时构造期明确抛错；
4. `ops package check` 全绿；一期四包测试不回退；blog `test:core` 零回归。

## 非目标

- 不做 `@fluvient-loom/web`（浏览器专有：localStorage / history / DOM——随导航运行时立项）；
- 不做重试 / 缓存 / 认证等网络策略（策略归内核与消费侧）；
- 不改名占用 `infra` 等通用名目（结构裁定：每宿主一包）。
