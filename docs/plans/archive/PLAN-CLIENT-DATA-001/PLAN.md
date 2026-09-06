---
kind: plan
id: PLAN-CLIENT-DATA-001
status: completed
owner: project-manager
created: 2026-09-05
last_reviewed: 2026-09-05
---

# 客户端数据访问层抽取

## 目标

抽取一个与 UI 框架无关的纯 TypeScript 客户端数据访问层，隔离业务前端与具体请求协议、传输方式和异步执行细节。业务方只面向领域能力协议，初期通过 Solid adapter 使用，未来可扩展 React 和 Vue。

## 成功标准

- 业务页面不直接调用 `fetch`、HTTP client、URL、HTTP method 或后端 DTO。
- 领域能力以业务意图命名，例如 `articleCatalog.listPublishedArticles`、`draftEditor.saveDraft`。
- 领域能力返回领域对象或领域结果，不返回页面专用 View Model。
- 核心层只依赖纯 TypeScript；Solid adapter 依赖核心层，核心层不反向依赖 Solid。
- `DataTask` 惰性创建、显式 `start()`、单次执行、可取消。
- 为未来实时推送保留独立的 `DataStream` 抽象；MVP 不实现实时流。
- 外部边界使用 Zod 运行时解析，关键标识使用 Brand type。
- Transport 只支持 JSON 可表达的数据；协议模型禁止 `null`，可选值使用 `undefined`，清空通过显式领域命令表达。
- 不在本计划中实现客户端状态管理、缓存、持久化、乐观更新或框架级数据生命周期。

## 非目标

- 不重做后端 API 或强制采用 REST 风格。
- 不实现实时推送、WebSocket、SSE 或流式 AI 响应；只保留扩展接口。
- 不实现 React/Vue adapter；只要求核心边界可扩展。
- 不把页面 View Model、格式化逻辑或 UI 状态放入核心层。
- 不在本计划中解决缓存、全局状态和查询失效。

## 已确认的设计决策

### 分层

```text
业务前端
  -> Solid adapter
  -> 领域能力协议
  -> DataTask / DataStream
  -> DataSource
  -> Transport adapter
  -> HTTP / SSE / WebSocket / Worker / Bridge
```

- `core` 只依赖纯 TypeScript；
- Solid adapter 依赖 `core`，`core` 不反向依赖 Solid；
- 未来 React/Vue 通过新增同级 adapter 接入，不修改领域协议；
- 页面层将领域对象转换为 PC/Mobile/B 各自的 View Model；
- 业务页面不感知 URL、HTTP method、DTO、Zod schema、transport 或后端字段。

### 领域能力入口

能力按业务意图命名，由独立能力对象实现，再由统一 `Client` 负责组装：

```ts
const client = createClient(config)

client.articleCatalog.listPublishedArticles(input)
client.recommendationFeed.getHomeRecommendations()
client.draftEditor.saveDraft(input)
```

不采用把 REST 资源路径直接映射为业务 API 的设计。领域能力返回领域对象或领域结果，不返回页面专用模型。

### DataTask

`DataTask` 是惰性、单次启动、可取消的一次性异步数据任务：

```ts
interface DataTask<T, E> {
  start(): Promise<Result<T, E>>
  cancel(): void
}
```

创建任务不产生副作用；`start()` 才开始执行；同一个任务不允许重启，需要重新执行时创建新的任务。重试由更高层创建新的任务编排，不塞进任务生命周期。

### DataStream 扩展点

实时推送不在 MVP 实现。未来使用独立的 `DataStream`，不把持续事件塞进 `Result<T, E>`，也不让 `DataTask` 同时承担两种生命周期：

```ts
interface DataStream<T, E> {
  start(): AsyncIterable<DataEvent<T, E>>
  cancel(): void
}
```

`AsyncIterable` 适合顺序消费和异步背压；面向 UI 的便捷 handler API 可以由框架 adapter 提供，业务层不直接比较事件字符串。

### Result、错误与边界解析

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }
```

- Zod 只在 HTTP、Worker、Bridge、localStorage 或未来流事件等外部边界做运行时解析；
- adapter 将 `ZodError` 转为稳定的协议/解码错误，不泄漏到业务组件；
- Brand type 用于 `ArticleId`、`TopicId` 等关键标识，避免不同 ID 混用；
- 内部已解析数据不重复 parse。

### JSON 与可选值

- Transport 只支持 JSON 可表达的字段和值；
- 领域协议禁止 `null`；
- 可选字段使用 `undefined`，序列化时被省略；
- `undefined` 表示“不修改”；
- 清空、删除、重置必须使用显式领域命令，不能使用 `null`。

## 约束与依据

- 事实：`FACT-PRODUCT-001`；
- 架构：`ARCH-FRONTEND`、`ARCH-BACKEND`、`ARCH-DATA-API`；
- 技术边界：纯 TypeScript core，Solid adapter 独立模块；
- 错误边界：Zod/transport 错误必须在 adapter 内归一化，不泄漏到业务组件；
- 传输约束：仅 JSON 字段和值，不使用 `null`。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 产品：领域能力协议 | product | - | `docs/specs/`, 本计划 | ready |
| 核心：纯 TS 数据任务与协议层 | frontend-core | 产品 | `web/src/shared/data/` | ready |
| 适配：Solid 响应式绑定 | frontend-solid | 核心 | `web/src/solid/`, `web/src/mobile/`, `web/src/desktop/` 仅接入点 | ready |
| 项目管理：协调与集成验收 | project-manager | 全部工作流 | 计划、结果、状态记录 | ready |

项目经理启动提示见同目录的 `PM-PROMPT.md`。

## 集成验收

1. 产品工作流产出领域能力清单、输入/输出对象和 `SPEC-*` 场景。
2. 核心工作流实现 `Result`、`DataTask`、错误归一化、Brand type、Zod 边界和 transport/data-source 接口。
3. Solid 工作流提供响应式 adapter，并将至少一个 C 端和一个 B 端异步数据流程迁移到新协议。
4. 验证业务组件不再感知 URL、HTTP method、DTO、Zod schema 或底层 transport。
5. 验证任务未启动前无副作用，启动/取消/失败行为稳定，领域对象与页面 View Model 分离。
6. 运行既有质量检查，并保留协议、类型、单元和集成验收证据。

## 未决项

- 领域能力对象的具体拆分由产品工作流根据当前业务流程确定；
- `DataTask` 的取消错误类型和重试编排位置由核心工作流在不改变上述契约的前提下确定；
- `DataStream` 的最终消费 API 留待实时推送计划确定。
