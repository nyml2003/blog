---
kind: plan
id: PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001
status: ready
owner: project-manager
created: 2026-09-30
last_reviewed: 2026-09-30
---

# Frontend Infrastructure 适配器包收敛

## 目标

盘点并收敛 `src/frontend/app/infrastructure` 中可复用的宿主适配器，将通用浏览器能力并入现有
`@fluvient-loom/web`，将测试/Node 能力并入现有 `@fluvient-loom/node` 或明确的测试适配器，
让博客前端通过 workspace 包消费这些实现。

本计划先统一协议边界，再迁移实现和消费者。目标是减少 `app/infrastructure` 与
`@fluvient-loom/*` 的重复实现，不直接把整个目录原样发布成新包。

## 当前基线

- `src/frontend/app/infrastructure/browser` 提供 network、persistence、navigation、scheduler、document、viewport、space-time、operation-id 和 task factory。
- `src/frontend/app/infrastructure/memory` 提供内存 persistence 和 operation-id。
- 现有 `@fluvient-loom/port` 已定义网络、持久化、导航、调度、任务等协议；`@fluvient-loom/web` 已有浏览器 persistence、document、navigation、scheduler、operation-id；`@fluvient-loom/node` 已有内存 persistence、Node network、scheduler 和 operation-id。
- `app/kernel/ports`、`app/kernel/task`、`app/kernel/result` 与现有 `@fluvient-loom/common`、`port`、`query` 存在相似能力，当前前端仍直接依赖 `app/kernel`。
- `app/infrastructure/browser/validation/generated` 的 HTML 校验 WASM 属于博客正文协议和构建产物，不是通用宿主适配器。
- 当前工作树有其他前端架构迁移改动；本计划只处理基础设施包边界、适配器迁移和对应验证。

## 包边界

### 纳入

- 浏览器网络、存储、导航、调度、document、viewport、时间和 operation-id 适配器；
- 内存 persistence 和 operation-id 测试适配器；
- 适配器依赖的公开类型、错误归一和取消/超时行为；
- `app/infrastructure` 到现有 workspace 包的消费者迁移；
- `@fluvient-loom/web`、`@fluvient-loom/node` 的 README、exports、类型声明和 package smoke；
- 适配器独立测试、协议兼容测试和前端集成验证。

### 不纳入

- 不新建一个与 `@fluvient-loom/web` 重复的 infrastructure 包；
- 不把 `article_html_wasm`、HTML 校验 profile、诊断 schema 或博客正文协议发布为通用包；
- 不改变公开 API、管理 API、路由 alias、文章状态、页面行为或业务数据；
- 不在本计划中整体替换 `app/kernel`，但必须记录它与 `@fluvient-loom/*` 的最终协议关系；
- 不迁移 Mobile UI 原子组件，本计划与 `PLAN-MOBILE-H5-SOLID-ATOMS-001` 分开执行。

## 目标结构

```text
@fluvient-loom/common   → Result、取消、基础类型
@fluvient-loom/port     → 宿主无关 ports
@fluvient-loom/query    → Task/Resource 实现
@fluvient-loom/web      → 浏览器 document/navigation/network/persistence/scheduler 等适配器
@fluvient-loom/node     → Node 与内存适配器
```

`app/bootstrap` 只负责把浏览器原生对象和运行配置装配进适配器；`app/habitat` 不直接访问
`window`、`localStorage`、`fetch` 或计时器。若 `app/kernel` 仍需保留，必须通过明确的兼容边界
与共享包互操作，不能长期维护两套同名 ports。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 协议盘点与归并设计 | frontend+qa | - | ports 对照表、包 API、架构说明、本计划 | ready |
| Web 适配器迁移 | frontend | 协议设计 | `packages/web/**`、浏览器适配器测试、exports | ready |
| Node/Memory 适配器迁移 | frontend | 协议设计 | `packages/node/**`、内存适配器测试、exports | ready |
| 前端消费者切换 | frontend | Web/Node 包通过独立验证 | `src/frontend/app/bootstrap/**`、kernel 兼容边界、tsconfig 与测试 | ready |
| 重复实现清理 | frontend+qa | 全部消费者切换 | 无消费者的 `app/infrastructure/**`、重复 ports、测试和文档 | ready |
| 集成验收与发布准备 | qa+release | 清理完成 | package smoke、前端质量报告、README、发布元数据 | ready |

共享 ports、适配器 exports、前端 bootstrap 装配属于串行写集。协议未冻结前，不并行改动同一适配器。

## 适配器迁移清单

### 优先迁移到 `@fluvient-loom/web`

- `createBrowserNetwork`；
- `createBrowserPersistence`；
- `createBrowserNavigation`；
- `createBrowserScheduler`；
- `createBrowserDocument`；
- `createBrowserViewport`；
- `createBrowserSpaceTime`；
- `createBrowserOperationId`。

### 评估后迁移或合并

- `createBrowserAsyncPersistence`：与现有 `asAsyncPersistence` 对照，避免重复导出；
- `createBrowserDataTask`：与 `@fluvient-loom/query` 和最终 task port 对照，不重复保留一层包装；
- `createMemoryPersistence`、`createMemoryAsyncPersistence`、`createMemoryOperationId`：与 `@fluvient-loom/node` 现有实现合并；
- HTML 校验 WASM：保持博客应用私有，只记录它与浏览器适配器的边界。

## 成功标准

1. 每个迁移适配器只有一个正式实现和一个明确的协议来源，不再同时维护 `app/infrastructure` 与 workspace 包的同名版本。
2. `@fluvient-loom/web`、`@fluvient-loom/node` 可独立 typecheck、test、build/smoke，并能被最小宿主示例消费。
3. 浏览器适配器的取消、超时、网络错误、JSON 解码错误、存储异常、定时器释放和事件订阅释放行为保持现有契约。
4. 博客 bootstrap 改为从 workspace 包装配宿主能力，页面和 habitat 不直接访问浏览器全局。
5. `app/infrastructure` 中无消费者的重复实现已删除；HTML 校验 WASM 和博客专属装配仍有明确归属。
6. `app/kernel/ports` 与 `@fluvient-loom/port` 的保留、迁移或兼容关系已写入架构文档，不留下隐式双协议。
7. 相关前端 typecheck、lint、format、测试、build、workspace package check 和 `git diff --check` 通过；浏览器验收单独记录。
8. 发布评审明确哪些包可以 npm 发布、哪些继续 workspace-only，不把迁移完成误写成 npm 已发布。

## 集成验收

1. 运行 `@fluvient-loom/web`、`@fluvient-loom/node` 的独立测试，覆盖正常、失败、取消、超时和资源释放路径。
2. 用 memory/mock ports 运行现有 Mobile/desktop API 与设置测试，确认数据逻辑不依赖具体宿主。
3. 构建前端并检查 bundle，确认没有重复打包两套 adapter 实现或残留旧相对导入。
4. 搜索 `app/infrastructure` 和 `app/kernel/ports` 的引用，确认每个保留文件都有明确消费者和归属。
5. 运行 `ops package check`、前端 typecheck/lint/format/build 和相关测试；受环境限制无法做真实浏览器验收时明确记录。

## 未决项

- 最终以 `@fluvient-loom/port` 还是 `app/kernel/ports` 作为唯一公共协议；两者不能长期并列。
- `createBrowserNetwork` 是否纳入现有 `@fluvient-loom/web`，以及是否需要拆分 fetch/JSON 解码策略。
- `createBrowserDataTask` 是否删除并统一使用 `@fluvient-loom/query`，还是保留浏览器 AbortController 适配子路径。
- `ViewportPort`、`DocumentPort`、`SpaceTimePort` 是否扩展到公共 `port` 包，还是作为 web 包私有类型。
- workspace 包是否先保持 private；npm 发布需要另行确认版本策略、license、仓库元数据和 CI provenance。
