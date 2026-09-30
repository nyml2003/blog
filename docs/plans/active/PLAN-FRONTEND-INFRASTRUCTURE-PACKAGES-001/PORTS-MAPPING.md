---
kind: research
id: PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001-PORTS
status: verified
created: 2026-09-30
last_reviewed: 2026-09-30
---

# 协议盘点与归并对照表（工作流 1）

结论：`app/kernel` 与 `@fluvient-loom/*` 之间没有签名漂移。所有重名接口和实现逐行相同，
只差 import 来源。归并是机械替换，无行为风险。核对面：`src/frontend/app/kernel/**` 对
`packages/common|port|query/src/**`，方法为逐文件 diff（2026-09-30，基线 commit `8f57b81`）。

## 一、ports 接口对照

重名接口 23 个，全部零漂移：

| 文件 | kernel 侧 | 包侧 | diff 结果 |
| --- | --- | --- | --- |
| command.ts | `app/kernel/ports/command.ts` | `packages/port/src/ports/command.ts` | 仅 import 路径不同 |
| document.ts | 同上结构 | 同上 | 逐字节相同 |
| navigation.ts | 同上 | 同上 | 仅 import 路径不同 |
| network.ts | 同上 | 同上 | 仅 import 路径不同 |
| persistence.ts | 同上 | 同上 | 仅 import 路径不同 |
| resource.ts | 同上 | 同上 | 逐字节相同 |
| scheduler.ts | 同上 | 同上 | 仅 import 路径不同 |
| task.ts | 同上 | 同上 | 仅 import 路径不同 |

kernel 侧差异均为：从 `../result`、`../readonly`、`./cancellation`、`./resource` 导入，
包侧统一从 `@fluvient-loom/common` 导入。语义完全一致。

仅 kernel/ports 有的接口：

- `CancellationFailure`、`CancellationSignal`、`CancellationSource`：对应物在 `@fluvient-loom/common/src/cancellation.ts`，逐行相同。
- `SpaceTimePort`（`now(): number`，3 行）：无任何包对应。
- `ViewportPort`（`scrollY()`/`scrollTo()`，4 行）：无任何包对应。

仅包侧有的运行时工具（kernel 无对应物）：

- `@fluvient-loom/port`：`asAsyncPersistence`（combinators.ts）、`createJsonRequester` + `JsonRequester` 类型（requester.ts）。
- `@fluvient-loom/common`：`ResourceHandle`（port 包 index 未导出，实际从 common 出）。

## 二、kernel 基础件与包实现对照

| kernel 文件 | 包对应物 | diff 结果 | 消费状况 |
| --- | --- | --- | --- |
| `result.ts`（7 行） | `common/src/result.ts` | 逐字节相同 | 全前端广泛使用 |
| `readonly.ts`（12 行） | `common/src/readonly.ts` | 逐字节相同 | 同上 |
| `cancellation.ts`（46 行） | `common/src/cancellation.ts`（58 行，含类型） | 实现逐行相同 | kernel/task 依赖 |
| `task.ts`（88 行） | `query/src/task.ts`（90 行） | 逐行相同（只差 import） | habitat 使用 |
| `resource.ts`（127 行） | `query/src/resource.ts`（130 行） | 逐行相同（只差 import） | habitat 使用 |
| `desired-state.ts`（230 行） | 无对应 | — | 仅 `habitat/mobile/logic/settings-page.ts` 消费 |

## 三、`app/kernel` 消费面（迁移影响范围）

- 源码 30 个文件 import kernel：bootstrap 3、habitat 18、infrastructure 12（browser 10 + memory 2）。
- 测试 7 个：`tests/app/kernel/*` 3、`tests/app/api/*` 2、`tests/app/infrastructure/*` 1、settings 1。
- `kernel/index.ts` 的 `export * from "./ports/index"` 使 kernel 成为 ports 的再导出面，这是双协议观感的直接来源。

## 四、归并方向（待决策确认）

建议以 `@fluvient-loom/port` + `@fluvient-loom/common` 为唯一协议与基础件来源：

1. 零漂移意味着切换是纯 import 替换，不需要适配层；
2. 包侧已多出 `asAsyncPersistence`、`createJsonRequester` 两个 kernel 没有的工具；
3. plan 目标结构已把 `port` 画为公共协议层。

`app/kernel` 的最终残余只有两个真实独有物：

- `desired-state.ts`：应用级状态管理，不属于宿主适配层，保留在应用内；
- `SpaceTimePort`、`ViewportPort`：建议上移到 `packages/port`（宿主无关、无浏览器类型引用），随 web 适配器迁移一并处理。

## 五、对未决项的影响

- 未决项 1（唯一协议）：事实部分已查清（零漂移），方向建议 port；待明确决策。
- 未决项 2（`createBrowserNetwork` 归属）：web 包目前无 network 适配器，node 包有 `createNodeNetwork`；建议补进 web 包。
- 未决项 3（`createBrowserDataTask`）：源码零消费者（仅 `tests/app/infrastructure` 使用），且与 `query` 包 `createDataTask` 逐行重复；建议删除而不是迁移。
- 未决项 4（SpaceTime/Viewport）：建议上移 port 包。
