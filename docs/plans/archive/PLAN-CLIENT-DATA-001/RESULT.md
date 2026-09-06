---
kind: plan-result
id: RESULT-CLIENT-DATA-001
plan_id: PLAN-CLIENT-DATA-001
status: completed
completed: 2026-09-05
owner: project-manager
---

# 客户端数据访问层抽取结果

## 结果

已完成 UI 框架无关的 TypeScript 数据访问核心、Solid adapter，以及 Desktop、Mobile、Admin 页面迁移。业务页面不再直接依赖旧 `api-client`、`fetch`、DTO 或 transport 细节。

## 已验证内容

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| 领域能力 client 覆盖公共读、Admin 读写、taxonomy 和推荐 | `web/common/data/client.ts` | 通过 |
| Solid 生命周期、取消、reload 和状态消费 | `web/solid/data/use-data-task.ts`、`use-data-task.test.ts` | 通过 |
| 页面无旧 `api()` / `postJSON()` / `api-client` 引用 | `rg -n "from .*api-client|postJSON|api\\(" web/desktop/src web/mobile/src` | 无匹配 |
| 核心和 adapter 测试 | `tsx --test common/data/core.test.ts solid/data/use-data-task.test.ts` | 7/7 通过 |
| 类型检查 | `tsc --noEmit -p web/tsconfig.json` | 通过 |
| lint | `oxlint --deny-warnings desktop mobile common solid vite.config.ts` | 通过 |
| 格式 | `biome check` | 通过 |
| 生产构建 | `vite build` | 通过 |

## 生效变化

- Facts：无；
- Architecture：无；
- Specs：无；
- 删除废弃文件：`web/common/logic/api-client.ts`。

## 未决项与后续计划

- DataStream 仍是未来实时推送计划的扩展点，MVP 未实现实时流；
- React/Vue adapter 不在本计划范围内；
- 缓存、持久化、客户端全局状态和查询失效不在本计划范围内。
