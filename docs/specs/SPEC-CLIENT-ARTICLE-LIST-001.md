---
kind: spec
id: SPEC-CLIENT-ARTICLE-LIST-001
status: accepted
owner: frontend-desktop
plan_id: PLAN-CLIENT-ARTICLE-LIST-001
last_reviewed: 2026-09-06
---

# 文章列表 wire 契约与客户端解码（列表/详情形状拆分）

## 目标

客户端（common/client + Desktop 页面）的解码与类型严格对齐后端既有 wire 契约：**列表端点返回不含 `contentHtml` 的列表卡片，详情端点返回含正文的完整形状**。修复 Desktop 列表页因形状不匹配导致的“文章加载失败”。

## 非目标

- 不修改后端 wire 结构、接口行为或数据库；
- 不动 `mobileShelf`、推荐、详情端点的消费方；
- 不引入列表分页 UI（后端已支持 `page`/`pageSize` 而前端未用，属相邻问题，另行处理）；
- 不重构 Desktop 组件或 CSS。

## 契约

- **两种形状**（依据 `src/core/protocol/src/wire.rs`）：
  - `ArticleListItem`（`public.article_list` / `admin.article_list` 的 items）：`id/title/summary/articleTypeId/articleType?/status/createdAt/updatedAt/publishedAt?/termIds/terms`——**无 `contentHtml`**；
  - `ArticleDetail`（`public.article_detail` / `admin.article_detail` / 推荐流）：列表字段 + `contentHtml`。
- **客户端类型拆分**：`common/contracts/domain.ts` 新增 `ArticleListItem`（无 `contentHtml`），`Article` 保留为详情形状（先例：`MobileShelfArticle` 即 mobile shelf 的无正文卡片形状）。
- **解码拆分**：`articleListSchema` 的 items 改用列表项 schema（不声明 `contentHtml`）；详情 / 推荐流继续用含必填 `contentHtml` 的 schema。
- **测试锚定**：client 单测 fixture 必须复刻真实 wire 形状——列表项不含 `contentHtml`；另需负样例（详情缺失 `contentHtml` 解码失败）防止再次漂移。

## 场景

### SPEC-CLIENT-ARTICLE-LIST-001-001

Given 后端存在已发布文章

When 用户在 Desktop 打开 `/articles/index.html`（全部文章页，含任意筛选组合）

Then 列表正常渲染，不出现“文章加载失败，请重试”，`total` 正确显示

### SPEC-CLIENT-ARTICLE-LIST-001-002

Given 后端存在任意状态的文章

When 用户在 Desktop 打开 `/admin/`（文章管理首页）

Then 列表正常渲染，不出现加载失败

### SPEC-CLIENT-ARTICLE-LIST-001-003

Given 列表接口响应的 items 不含 `contentHtml`（真实 wire 形状）

When 客户端解码

Then 解码成功，列表项类型为 `ArticleListItem`；消费列表的组件（Shelf 及其变体）不访问 `contentHtml`

### SPEC-CLIENT-ARTICLE-LIST-001-004

Given 详情或推荐流接口响应缺失 `contentHtml`

When 客户端解码

Then 解码失败并按既有错误路径呈现（详情形状的正文字段保持必填）

### SPEC-CLIENT-ARTICLE-LIST-001-005

Given Mobile 端任意页面

When 本修复合入后回归

Then Mobile 行为零变化（`mobileShelf` / 详情消费路径不改动）

## 边界与失败

- 列表 schema 不声明 `contentHtml`：zod 默认丢弃未知键，后端将来若回带该字段也不崩；不在列表形状上做“允许可选 contentHtml”的模糊处理。
- `terms` 在后端列表形状中恒存在（非 Option），前端保持可选不收紧，避免无谓的兼容风险。
- 本修复与两个在途计划（`PLAN-MOBILE-THEME-SETTINGS-001`、`PLAN-DESKTOP-EDITOR-001`）无写集重叠（不触碰 `vite.config.ts`、`package.json`、mobile 与 editor 文件）。

## 测试/验收证据

- 2026-09-06，003 / 004：`src/frontend/common/client/client.test.ts` 覆盖公开与 Admin 非空无正文列表、草稿缺发布时间、分页 total 保留、列表丢弃意外正文，以及公开详情 / Admin 详情 / 推荐缺正文失败和含正文成功。两项列表回归修复前失败，修复后 client 4 项全部通过。
- 2026-09-06，001 / 002：真实 Rust Product + Data（8180/8181）与实际构建产物，Playwright Chromium 1440x1000 验证公开默认 9 条、类型与标签组合筛选 2 条、Admin 12 条（含草稿与已发布），列表标题及数量与真实 wire 一致，公开 total 文案正确；截图人工检查正常。
- 2026-09-06，005：390x844 Mobile 首页 6 条推荐、文章库 total 9 / 含推荐重复展示 12 张卡片、详情正文正常；Desktop 详情同样通过。浏览器 pageerror 为 0。本次未修改 Mobile 消费路径。
- 标准 build / lint / test:core 通过（32 tests + 287 Native/WASM parity cases），改动文件格式检查通过。全量 typecheck 和 format:check 仍被 Mobile 在途文件的基线问题阻塞，Spec 保留 draft，待整体质量门禁解除后最终验收。
- 复现命令、截图路径、人工 Review 和限制见 [RESULT.md](../plans/archive/PLAN-CLIENT-ARTICLE-LIST-001/RESULT.md)。
