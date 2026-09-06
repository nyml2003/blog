---
kind: workstream
id: WORKSTREAM-FRONTEND-CLIENT
status: review
plan_id: PLAN-CLIENT-ARTICLE-LIST-001
role: frontend-desktop
owner: frontend-desktop
depends_on: []
write_set:
  - src/frontend/common/contracts/domain.ts
  - src/frontend/common/client/domain.ts
  - src/frontend/common/client/client.ts
  - src/frontend/common/client/client.test.ts
  - src/frontend/desktop/src/app.tsx
  - src/frontend/desktop/src/pages/public/articles.tsx
  - src/frontend/desktop/src/pages/admin/home.tsx
  - docs/specs/SPEC-CLIENT-ARTICLE-LIST-001.md
  - docs/plans/active/PLAN-CLIENT-ARTICLE-LIST-001/
last_reviewed: 2026-09-06
---

# 工作流：前端（client + desktop）列表契约修复

## 目标

实现 [SPEC-CLIENT-ARTICLE-LIST-001](../../../../specs/SPEC-CLIENT-ARTICLE-LIST-001.md) 全部场景：类型 / schema 拆分、两个列表端点解码修复、消费方类型收窄、测试锚定真实 wire。

## 输入

- Spec：`SPEC-CLIENT-ARTICLE-LIST-001`；
- 契约源：`src/core/protocol/src/wire.rs`（`ArticleListItem` 无 `contentHtml`；`ArticleDetail` 含；`ArticleListPage` = `{ items, page, pageSize, total }`）；
- 修复前核实：`common/client/domain.ts` 的 `articleSchema` 要求 `contentHtml`；`client.ts` 的两个列表方法使用本文件内重复的 `listSchema`，items 同样采用详情 schema；`Shelf` 收 `readonly Article[]`；原 client 单测只有空列表 fixture，缺少真实非空 wire 覆盖。

## 输出

- `common/contracts/domain.ts`：新增 `ArticleListItem`（无 `contentHtml` 的列表投影；先例 `MobileShelfArticle`），`Article` 保留为详情形状；
- `common/client/domain.ts`：`articleListItemSchema`（不声明 `contentHtml`），`articleListSchema` 的 items 改用它；`articleSchema`（详情，`contentHtml` 必填）不变；
- `client.ts`：两个列表端点返回类型改为 `{ items: ArticleListItem[]; total: number }`；
- `desktop/src/app.tsx`：`Shelf` 收 `readonly ArticleListItem[]`；两个页面（public/articles、admin/home）随类型收窄，不访问 `contentHtml`；
- `client.test.ts`：列表 fixture 去掉 `contentHtml`（锚定真实 wire）；新增负样例：详情响应缺失 `contentHtml` 解码失败；列表项不含 `contentHtml` 解码通过且类型正确。

## 实施任务

1. 类型与 schema 拆分（contracts → client/domain → client.ts 返回类型）；
2. 消费方类型收窄（app.tsx Shelf、两个页面），编译期确认无 `contentHtml` 访问；
3. 测试锚定与负样例；
4. Spec 证据回填。

依赖顺序 1 → 2 → 3 → 4。

## 测试/验收

- `pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿；
- 人工：Desktop `/articles/index.html`（默认 + 一组筛选）与 `/admin/` 渲染正常；Mobile 首页 / 全部文章抽查。

## 阻塞

- 本次修复前后全量 typecheck 均在 `mobile-ui/atoms/define.ts:48` 报 TS2345；format:check 在 `mobile-ui/atoms/select.tsx:32` 报格式差异。属于另一在途计划写集，保留原状。本工作流改动文件未出现类型、lint 或格式告警。

## 交付记录

- 2026-09-06：完成 5 个源码文件的最小修改；列表类型在两个 domain 层定义为 `Omit<Article, "contentHtml">`，列表 schema 从详情 schema 显式 omit 正文字段。`client.ts` 移除重复列表 schema，两个入口统一使用 `articleListSchema`；`parseArticleList` 与 Desktop `Shelf` 同步收窄。两个页面原有类型推导即可接收列表项，无需改源码。
- 2026-09-06：回归测试先红后绿，详情 / Admin 详情 / 推荐缺正文拒绝与含正文成功均覆盖。标准 build、lint、32 core tests 和 287 Native/WASM parity cases 通过；本次 5 文件格式检查通过。
- 2026-09-06：真实 Product + Data（8180/8181）浏览器回归通过：公开 9 条、类型与标签筛选 2 条、Admin 12 条；Desktop 详情及 Mobile 首页 / shelf / 详情通过。脚本 [BROWSER-CHECK.mjs](./BROWSER-CHECK.mjs)，完整证据与人工 Review 见 [RESULT.md](./RESULT.md)。
