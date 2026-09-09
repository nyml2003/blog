---
kind: plan-workstream
id: WORKSTREAM-DOMAIN-SPLIT
plan_id: PLAN-CODE-LAYOUT-001
owner: frontend
status: ready
last_reviewed: 2026-09-09
---

# 前端领域拆分（R2）

## 职责

把跨领域大文件按领域拆开，**对外 import 面保持不变**（页面零改动），让"看一个领域的取数逻辑"只开一个文件。

## 拆分设计

目标形态遵循 PLAN.md 的**文件形态约定**：A 形态（多导出、成员独立：工具库/hook 集/类文件）与 B 形态（单导出：一个组件/一个类）。混合文件一律拆开。

### 混合文件拆解（B 形态组件 + A 形态工具）

| 现文件 | 拆成 |
| --- | --- |
| `desktop/src/app.tsx` | B：`shell/header.tsx`（页头壳）、`shell/article-table.tsx`、`shell/public-shelf.tsx`、`shell/status.tsx`、`shell/article-body.tsx`；A：`shell/format.ts`（qs/date/shortDate 工具，成员独立） |
| `mobile/src/components/ui.tsx` | B：`mobile-nav.tsx`、`article-row.tsx`、`article-card.tsx`、`shelf-section.tsx`、`mobile-t-shelf.tsx`、`state-message.tsx`、`article-body.tsx`；A：`shelf-format.ts`（shortDate/sectionTypeId 等纯函数） |

### `solid/queries/public.ts`（436 行）→ A 形态 hook 集

| 新文件 | 内容 | 形态 |
| --- | --- | --- |
| `queries/articles.ts` | 文章列表/检索/详情（listPublished、browse、detail 资源） | A（hook 集，各查询独立） |
| `queries/shelves.ts` | T 型货架 + Mobile 文章货架（useTShelf、shelf 分页状态） | A |
| `queries/taxonomy-public.ts` | 公开 taxonomy 树 + 分类货架查询 | A |

`queries/admin.ts`、`taxonomy-source.ts`、`site-routes.ts`、`html-inspection.ts` 已是领域文件，不动。

### `common/client/client.ts`（819 行）→

| 新文件 | 内容 |
| --- | --- |
| `client/api-client.ts` | `createClient` 组合根 + `request`/`getPath`/`postBody` 基础设施 |
| `client/routes-contract.ts` | `CLIENT_API_ROUTES` 契约表与类型（golden 锚点不移动语义） |
| `client/domains/<领域>.ts` | 按接口组拆：session、articles、taxonomy、content、editor、site-routes |

`common/client/domain.ts` 的类型随所属领域迁入对应文件，主文件保留 re-export。

### 不变量（硬约束）

1. `solid/queries/index.ts` 的 re-export 集合不变 → **页面文件 git diff 必须为空**（混合文件拆解产生的 import 变更经 `desktop/app.tsx`→`shell/*` 的 re-export 过渡层吸收，页面不改）；
2. `common/client` 对外导出（index 或主文件）不变 → queries 层 import 不改；
3. 纯移动与重导出，禁止顺手改写逻辑；golden 测试（routes.json 对照）必须原样通过；
4. 产物必须落在两种形态之一：A（多导出、成员彼此独立）或 B（单导出）；灰区报 R0 清单审定。

## Write set

`src/frontend/solid/queries/`、`src/frontend/common/client/`、`src/frontend/mobile/src/components/ui.tsx`（拆为壳/卡片/货架等领域组件）。

## 完成定义

门禁绿；页面文件零 diff；单文件行数显著下降（目标 ≤ 300 行/文件）。
