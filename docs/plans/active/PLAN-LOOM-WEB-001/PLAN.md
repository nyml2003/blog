---
kind: plan
id: PLAN-LOOM-WEB-001
status: ready
owner: project-manager
created: 2026-09-11
last_reviewed: 2026-09-11
---

# @fluvient-loom/web：浏览器宿主适配包

## 定位

宿主适配第三期（`PLAN-LOOM-NODE-001` 的对称件，2026-09-11 用户拍板"先把 web 支持了"）：把浏览器提供的能力适配成端口，让生命周期四件（restore / reconcile / mutate / project）在浏览器端有完整落点——`project` 写 `data-theme` 走 DocumentPort、`pagehide` 结算走 NavigationPort、持久化走 localStorage。**零 solid**（UI 粘合归接入期）。

铁律同前两期：`node:*` / 专有 API 零依赖；浏览器全局一律**默认绑定 + 注入覆盖**——node 下注入 fake 即可全量测试 web 适配，零 jsdom。

## 包清单

| 导出 | 兑现 | 默认绑定 | 注入 |
| --- | --- | --- | --- |
| `createWebPersistence` | PersistencePort | `localStorage`（每操作 try/catch → Result 失败，隐私模式即 err） | `storage`（StorageLike） |
| `createWebDocument` | DocumentPort（本期入 port 契约） | `document.documentElement` | `root`（get/setAttribute 面） |
| `createWebNavigation` | NavigationPort（本期入 port 契约）：current/push/replace/back + popstate/pagehide 订阅 | `history` + `location` + `window` 事件 | 三者皆可注入 |
| `createWebScheduler` | SchedulerPort | `queueMicrotask` / `setTimeout` / 真 `requestAnimationFrame`（缺席降级 setTimeout） | 四个定时入口 |

结构调整（随本期落地）：

- **port 包补契约**：`DocumentPort`、`NavigationPort` + `NavigationSnapshot`（胚胎原样）；
- **`asAsyncPersistence` 从 node 包迁入 port 包**（端口级组合子：PersistencePort → AsyncPersistencePort 的通用提升器，纯类型零平台——放契约包避免 common⇄port 运行时环；web 消费者不再从 node 包借）；
- **scheduler 适配 node/web 各自实现**（约 60 行薄重复，默认值不同；第三个宿主出现再抽取——不为此破包结构）。

## 工作流

| 步 | 内容 | 验证 |
| --- | --- | --- |
| W1 port 补契约 + 组合子迁移 | document.ts / navigation.ts 契约入 port；asAsyncPersistence 迁入 port；node 包改引用 | typecheck 绿、node 包测试不回退 |
| W2 web 包 | 四件适配（默认绑全局 + 注入） | typecheck 绿 |
| W3 注入式测试 | fake storage（含抛异常模式）/ fake root / fake history+location+window / 真 scheduler | 全绿 |
| W4 门禁与验收 | `ops package check`、blog `test:core` 回归、git 入档 | 验收四项 |

## 验收

1. `packages/web/src` 零 `node:` import（护栏 import 白名单全线适用）；平台全局访问按**宿主适配豁免**放行（护栏 `HOST_ADAPTER_PACKAGES = ["web"]`——适配层触碰浏览器全局正是其职责，内核包仍全量中立）；
2. 四件适配全部支持纯注入测试（node 下零 jsdom 跑通），默认绑定缺失时构造期明确抛错；
3. `ops package check` 全绿；一期 / 二期测试不回退；
4. blog `test:core` 零回归。

## 非目标

- 不做 View Transitions / DOM 渲染 / ViewAdapter（归 `PLAN-PAGE-RUNTIME-001`，R0 审定前不动）；
- 不做 solid signal 粘合（接入期）；
- 不做 storage 失效自动降级内存（Result 失败语义已够，策略归消费方）。
