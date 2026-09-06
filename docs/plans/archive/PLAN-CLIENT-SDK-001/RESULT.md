---
kind: plan-result
id: RESULT-CLIENT-SDK-001
plan_id: PLAN-CLIENT-SDK-001
status: completed
completed: 2026-09-05
owner: project-manager
---

# 客户端 SDK 与 Solid Resource 适配结果

## 结果

已完成通用 Data SDK、业务 Client SDK 和 Solid resource adapter 的分层实现。页面只依赖领域 Client 和 adapter，不直接拼接 URL、HTTP method、DTO 或 transport。

## 最终契约

- `DataTask<T, E>` 懒启动、单次执行、可取消，公开返回值为 `DeepReadonly<T>`；
- `DataResource<T, E>` 提供 `idle/loading/success/error/cancelled`、`snapshot`、`latest`、`start`、`refetch`、`cancel`、`subscribe`；
- `start()` 只启动一次；`refetch()` 取消前一任务并创建新任务；
- `refetch()` 清空 `snapshot`，`latest` 只在成功时更新；过期结果、失败和取消不会覆盖 `latest`；
- SDK 不提供 `reload`、`mutate/update`、Proxy、冻结、深拷贝、borrow/take 或 copy-on-write 语义；
- `Client` 位于 `web/common/client/`，浏览器组合根位于 `browser.ts`；通用层不依赖业务模型或 Solid。

## 已验证内容

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| Client 覆盖公共文章、推荐、移动 Shelf、taxonomy、Admin 和草稿操作 | `web/common/client/client.ts` | 通过 |
| `DeepReadonly` 编译期阻止读取结果写入 | `web/common/data/readonly.test.ts` | 通过 |
| DataTask、Transport、DataResource 生命周期和过期保护 | `web/common/data/core.test.ts`、`resource.test.ts` | 通过 |
| Solid adapter 启动、快照、刷新和取消 | `web/solid/data/use-data-resource.test.ts` | 通过 |
| 页面无旧 hook、旧移动 API、页面级 transport 和 `reload` | `rg` 源码扫描 | 无匹配 |
| TypeScript 类型检查 | `npm run typecheck --prefix web` | 通过 |
| 前端测试 | `npm run test:core --prefix web` | 9/9 通过 |
| lint 与格式 | `npm run lint --prefix web`、`npm run format:check --prefix web` | 通过 |
| 生产构建 | `npm run build --prefix web` | 通过 |
| 后端回归 | `go test ./...` | 通过 |

## 生效变化

- `web/common/data/` 只保留通用任务、资源、结果、错误、只读类型和 transport；
- `web/common/client/` 承担博客领域模型、Zod schema、Client capability 和浏览器组合；
- Desktop、Mobile 页面统一使用 `useDataResource`，PC/Mobile UI 仍保持隔离；
- 删除旧 `useDataTask`、移动端 `logic/api.ts` 和页面级请求包装；
- Facts、永久架构事实和后端 API 无需变更。

## 证据限制与后续项

- Solid 输入变化依赖浏览器客户端 effect；Node 下的 `tsx` 使用 SSR 条件导出，因此测试覆盖核心版本隔离，生产构建覆盖浏览器依赖图，未在本容器生成真实浏览器截图；
- `DataStream`、缓存、全局状态、Suspense/ErrorBoundary 深度集成和写入资源 API 留待独立计划；读取资源保持无写入契约。
