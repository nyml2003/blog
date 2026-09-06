---
kind: plan
id: PLAN-CLIENT-ARTICLE-LIST-001
status: review
owner: project-manager
created: 2026-09-06
last_reviewed: 2026-09-06
---

# 文章列表契约修复：Desktop“文章加载失败”

## 目标

按 [SPEC-CLIENT-ARTICLE-LIST-001](../../../specs/SPEC-CLIENT-ARTICLE-LIST-001.md) 修复 Desktop 全部文章页与 Admin 管理首页的“文章加载失败，请重试”：将客户端解码与类型对齐后端既有 wire 契约（列表卡片不含 `contentHtml`，详情含正文），并把单测 fixture 锚定到真实 wire 形状，防止契约漂移再次漏检。不改后端。

## 根因记录

- 后端列表端点（`public.article_list` / `admin.article_list`）返回 `ArticleListItem`，**故意不含 `contentHtml`**（`src/core/protocol/src/wire.rs:80`：“列表卡片：不含正文 HTML（列表与 mobile shelf 共一取舍）”），为既有 breaking change；
- 前端 `common/client/domain.ts` 的 `articleSchema` 将 `contentHtml` 定为必填；两个列表端点实际使用 `client.ts` 内重复定义的 `listSchema`，其 items 同样复用详情 schema → 非空列表 zod 失败 → 页面落入错误路径（公开列表报错，Admin 无 snapshot 持续显示加载中）；
- Mobile 走 `mobileShelf`（独立 `shelfSchema`）不受影响；详情 / 推荐端点返回 detail（含正文）不受影响；
- 2026-09-06 核对当前源码：`client.test.ts` 原有 fixture 只有 `{ items: [], total: 0 }`，未覆盖真实非空列表，故既有测试全绿。此前“fixture 自带正文”的描述不符合当前文件。

## 成功标准

1. Desktop `/articles/index.html`（含筛选组合）与 `/admin/` 列表正常渲染，无“文章加载失败”，`total` 正确；
2. `common/contracts/domain.ts` 拆分 `ArticleListItem`（无 `contentHtml`）与 `Article`（详情形状）；列表 schema 不声明 `contentHtml`，详情 / 推荐流保持必填；消费列表的组件类型随之收窄；
3. client 单测新增契约锚定：列表 fixture 复刻真实 wire（无 `contentHtml`）解码通过；详情缺失 `contentHtml` 解码失败的负样例；
4. Mobile 行为零变化（不改 `mobileShelf` / 详情消费路径，人工抽查回归）；
5. `pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿。

## 非目标

- 不修改后端 wire、接口行为、数据库；
- 不做列表分页 UI / 分页参数接入（后端已支持 `page`/`pageSize`，前端未用，属相邻问题）；
- 不重构 Desktop 组件与 CSS；不动在途两个计划的写集文件。

## 约束与依据

- Spec：`SPEC-CLIENT-ARTICLE-LIST-001`（本计划交付并验收）；
- 契约来源：`src/core/protocol/src/wire.rs`（`ArticleListItem` / `ArticleDetail` / `ArticleListPage`）；
- 架构事实：Desktop 列表消费方为 `desktop/src/pages/public/articles.tsx`、`desktop/src/pages/admin/home.tsx`（经 `desktop/src/app.tsx` 的 `Shelf`）；类型先例 `MobileShelfArticle`（无正文卡片形状）；
- 在途计划：`PLAN-MOBILE-THEME-SETTINGS-001`、`PLAN-DESKTOP-EDITOR-001` 与本计划无写集重叠（本计划不触碰 `vite.config.ts`、`package.json`、mobile、editor 文件）。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 前端（client + desktop） | frontend-desktop | - | 见 [WORKSTREAM-FRONTEND-CLIENT.md](./WORKSTREAM-FRONTEND-CLIENT.md) | review |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 集成验收

- 自动化：契约锚定单测（列表无 `contentHtml` 通过 / 详情缺失失败）；`pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿；
- 人工：Desktop `/articles/index.html`（默认 + 至少一组筛选）与 `/admin/` 真实渲染；Mobile 首页 / 全部文章抽查无回归；
- Spec 状态推进 `accepted`，证据回填。

## 未决项

- 2026-09-06：修复及真实 Product + Data 浏览器回归完成，见 [RESULT.md](./RESULT.md)。全量 typecheck 被原有 `mobile-ui/atoms/define.ts:48` TS2345 阻塞；全量 format:check 被原有 `mobile-ui/atoms/select.tsx:32` 格式问题阻塞。均属 Mobile 在途写集，不在本次修改范围。保留 review，不宣称全量门禁通过或归档完成。
- 修复后可能显露出“后端默认分页截断列表”的相邻问题（前端未传 `page`/`pageSize`）：本计划只修报错，若确认截断需另行立项，不在本次扩大范围。
