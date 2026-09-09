---
kind: workstream
id: WORKSTREAM-FRONTEND
status: completed
plan_id: PLAN-ARCH-BOUNDARY-001
role: frontend
owner: frontend
depends_on:
  - WORKSTREAM-GUARDRAIL
  - PLAN-MOBILE-BROWSE-IA-001:archived
  - PLAN-MOBILE-ATOM-EXPANSION-001:archived
write_set:
  - src/frontend/common/data/
  - src/frontend/solid/data/
  - src/frontend/solid/queries/
  - src/frontend/common/client/
  - src/frontend/mobile/src/pages/
  - src/frontend/mobile/src/components/ui.tsx
  - src/frontend/mobile/src/logic/
  - src/frontend/mobile/styles/
  - src/frontend/desktop/src/pages/
  - src/frontend/desktop/src/app.tsx
  - src/frontend/desktop/src/styles.css
  - src/frontend/package.json
  - docs/architecture/frontend.md
  - docs/specs/SPEC-ARCH-BOUNDARY-001.md
last_reviewed: 2026-09-07
---

# 工作流：前端治理（R2）

## 目标

按审定落位建立查询层，把数据装配从两端全部页面剥净（参数映射、fallback、错误语义、数据整形归查询层），豁免清单前端项清零。零行为变化。

## 输入

- R0 审定的查询层落位与 AUDIT-REPORT 前端清单；
- 既有资产：`useDataResource`、`createDataTask`、client 全部端点方法、`filterFromSearch/filterSearch`；
- 前置：BROWSE / ATOM-EXPANSION 归档（页面与 client 写集交接）。

## 输出

- **查询层**（位置按 R0 审定）：页面语义 hooks 全集——两端列表 / 详情 / 推荐 / taxonomy / 后台（保存 / 发布流随 CONTENT-TRUTH 交付形态对齐）、filter→query 映射、无效 ID 兜底任务、错误语义归一；
- **页面去数据化**：逐页替换为 hooks 消费，删除内联 client 调用 / createDataTask / 参数映射；组合根仅保留 transport 装配；
- 每迁一页：对应豁免项清零，门禁对全量生效；
- `docs/architecture/frontend.md` 分层图更新。

## 实施任务

1. 查询层骨架 + 首页样板（home）走通"迁移→门禁绿"节拍；
2. Mobile 各页 → Desktop 公开页 → Desktop 后台页逐页迁移；
3. 豁免清零 + 文档更新 + Spec 证据回填。

## 测试/验收

- 每页迁移后：门禁绿（该页无越权 import）、`pnpm --dir src/frontend typecheck / lint / build / test:core` 绿；
- 行为回归：页面走查与迁移前一致（数据、错误态、筛选、加载态）；
- 查询层单测：参数映射与 fallback 语义。

## 阻塞

- BROWSE / ATOM-EXPANSION 归档（写集交接）；
- 后台页保存流若逢 CONTENT-TRUTH EDITOR 工作流在途，对应页面顺延。

## 交付记录

2026-09-07 完成 R2 实现：

- 在 `src/frontend/solid/queries/` 建立页面查询层，统一承接参数归一、无效文章 ID
  失败任务、DTO 映射、错误语义、HTML 检查调度及 T 型货架异步资源；
- Desktop / Mobile 全部页面已迁移到查询层。静态扫描
  `rg -n "common/client|solid/data|common/data" src/frontend/desktop/src/pages src/frontend/mobile/src/pages --glob '*.ts' --glob '*.tsx'`
  无匹配；
- 按用户本轮已定规则，Mobile `/m/articles/index.html` 及二级页
  `/m/articles/list.html` 保持 F 型，其余公开文章展示货架使用 T 型；管理文章列表保持管理表格；
- T 型货架首次取得 filters 与首项文章，切换筛选重新请求并重渲染；筛选条在加载与
  错误期间保持稳定，支持 loading / error / empty / retry，并通过请求取消和 generation
  guard 防止旧响应覆盖；
- 查询层单测覆盖参数归一、无效 ID、URL 筛选以及快速切换时旧响应丢弃；client 测试
  覆盖 T 型货架请求和响应解码；
- `pnpm --dir src/frontend typecheck`、`lint`、`format:check`、`test:core`（76/76）及
  `build` 均通过；
- Playwright 实际走查 Desktop 首页、Desktop 全部文章、Mobile 首页筛选切换，核对请求
  返回和重渲染结果；另以拦截响应验证 error → retry → loading → empty。Mobile 两个 F 型
  页面结构保持，所测视图均无页面级横向溢出或脚本错误。
