---
kind: plan
id: PLAN-CLIENT-SDK-001
status: completed
owner: project-manager
created: 2026-09-05
last_reviewed: 2026-09-05
supersedes: PLAN-CLIENT-DATA-001
---

# 客户端 SDK 与 Solid Resource 适配

## 目标

在一个计划内建立三层客户端 SDK：不感知业务的通用 Data SDK、面向领域能力的业务 Client SDK，以及 Solid adapter。业务页面不感知具体请求协议、DTO、传输方式或 SDK 内部实现。

## 分层边界

```text
业务前端
  -> Solid resource adapter
  -> 业务 Client SDK
  -> 通用 Data SDK
  -> Transport
  -> HTTP / Worker / Bridge / 未来流式传输
```

### 通用 Data SDK

纯 TypeScript、业务无关，只提供：

- `DataTask<T, E>`、未来的 `DataStream<T, E>`；
- `Result<T, E>`、`DataResource<T, E>`、`Transport` 和通用错误边界；
- `DeepReadonly<T>` 公共返回类型；
- 取消、超时和 JSON transport 能力。

不得出现 `Article`、`ArticleCatalog`、Zod 业务 schema 或业务 Brand 类型。

### 业务 Client SDK

在同一计划内实现业务协议，但与通用 Data SDK 分模块：

```ts
client.articleCatalog.listPublishedArticles(input)
client.recommendationFeed.getHomeRecommendations()
client.draftEditor.saveDraft(input)
```

它负责领域能力、领域对象、业务 Zod schema 和 DTO 到领域对象的映射；业务页面不暴露 REST 资源、URL、HTTP method、后端字段或 transport。浏览器组合根在 `common/client/browser.ts` 注入 JSON transport。

### Solid adapter

只负责订阅 framework-neutral `DataResource` 并映射为 Solid accessor。核心 API 保持泛型，不包含业务类型。

```ts
const resource = useDataResource(
  input,
  (value) => client.articleCatalog.listPublishedArticles(value),
)
```

资源暴露 `status()`、`snapshot()`、`latest()`、`loading()`、`error()`、`start()`、`refetch()` 和 `cancel()`；不提供 `reload`、`mutate`、Proxy 或写入 API。

## 已确认的异步语义

```ts
interface DataResource<T, E> {
  getSnapshot(): {
    status: "idle" | "loading" | "success" | "error" | "cancelled"
    snapshot: DeepReadonly<T> | undefined
    latest: DeepReadonly<T> | undefined
    error: E | undefined
  }
  subscribe(listener: () => void): () => void
  start(): Promise<Result<DeepReadonly<T>, E>>
  refetch(): Promise<Result<DeepReadonly<T>, E>>
  cancel(): void
}
```

- 创建任务不产生副作用；
- `start()` 懒启动且同一 Resource 只启动一次；重新执行只能调用 `refetch()`；
- `refetch()` 取消前一任务、创建新任务，并立即清空 `snapshot`；
- `latest` 只在成功时更新，刷新、失败、取消和过期任务均保留原值；
- 当前请求完成值与 `latest` 都是 `DeepReadonly<T>`，SDK 不承诺深拷贝、冻结、Proxy 或 copy-on-write；
- 任务 reject 被转换为稳定错误状态，过期任务不覆盖当前状态；
- DataTask 不承担缓存、全局状态或跨页面共享。

未来实时推送使用独立 `DataStream`，不把持续事件塞进 `Result`，MVP 不实现。

## 数据与协议规则

- Transport 只支持 JSON 可表达的字段和值；
- 领域协议禁止 `null`，可选值使用 `undefined`；
- `undefined` 序列化时省略，表示“不修改”；
- 清空、删除、重置使用显式领域命令；
- 外部边界使用 Zod 解析，解析错误转为稳定协议错误；
- Brand type 和 Zod schema 属于业务 Client 层，只用于确实需要区分的标识和外部协议边界；
- 页面 View Model 由各端页面自行生成。

## 非目标

- 不实现通用客户端缓存、查询失效和全局状态管理；
- 不实现实时推送、React/Vue adapter 或流式 AI；
- 不强制使用 REST 风格；
- 不让通用 Data SDK 依赖业务领域类型或 Solid；
- 不实现 `reload`、`mutate`、全局缓存、Proxy、借用/take 或 copy-on-write；
- 不把 `useDataResource` 变成第二个状态管理系统。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 产品：业务 Client SDK 协议 | product | - | `docs/plans/archive/PLAN-CLIENT-SDK-001/` | completed |
| Core：通用 Data SDK | frontend-core | - | `web/common/data/` | completed |
| Domain：业务 Client SDK 实现 | frontend-core | 产品、Core | `web/common/client/` | completed |
| Solid：Resource adapter | frontend-solid | Core、Domain | `web/solid/data/`、各端接入点 | completed |
| 测试：协议、任务和 adapter | frontend-core | 全部实现 | `web/common/**/*.test.ts`、`web/solid/**/*.test.ts` | completed |
| 项目管理：协调与集成验收 | project-manager | 全部工作流 | 计划、结果、状态记录 | completed |

项目经理启动提示见同目录的 `PM-PROMPT.md`。

## 集成验收

1. 通用 Data SDK 在不导入业务模块和 Solid 的情况下通过类型、单元和契约测试。
2. 业务 Client SDK 只暴露领域能力和领域对象，完成至少 C 端和 B 端代表流程。
3. `useDataResource` 支持任务工厂、取消、过期任务保护、`snapshot`、`latest` 和错误捕获。
4. `snapshot`、`latest`、取消和 `refetch` 的语义有核心测试覆盖，且没有值写入 API。
5. 业务组件不感知 URL、HTTP、DTO、Zod schema 或 transport。
6. 页面 View Model 与领域对象保持隔离，PC/Mobile 实现不合并。

## 后续项

- `DataStream` 的最终 API 留待实时计划；它不复用 `Result` 或本 Resource。
- 若出现明确写入场景，再以领域命令和输入 DTO 设计，不为读取资源增加 `mutate`。
