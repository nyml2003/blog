---
kind: plan
id: PLAN-NAV-ACTIONS-001
status: completed
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# 顶部导航操作：后退 / 搜索 / 收藏 / 分享 / 更多

## 目标

把 Mobile 顶部导航栏从"仅品牌链接"升级为操作入口：**后退、搜索、收藏、分享、更多**。本轮只做 Mobile；Desktop 后续另行设计。每个公开 Mobile HTML 页面使用一次页面级 HTTP/BFF 请求，聚合页面数据和导航模块数据，前端按 `moduleKey` 分发。

产品指定的推进顺序：**先冻结契约 → 页面级 BFF 聚合与共享逻辑 → Mobile 页面接入**。导航栏是跨前后端的业务模块：后端通过 SPI 组装模块数据，前端页面壳集成导航模块。收藏与分享属于一期体验计划中明确"单独讨论"的 P3 产品能力，本计划即为该讨论与落地载体。

## 关键架构边界（先钉死，方案不越界）

- **npm 包不承载 UI**：Desktop 与 Mobile 的页面、DOM、CSS、交互相互隔离是项目稳定边界。共享包只能承载协议类型、API client、分享链接构造、后退策略等纯函数与数据语义；两端 UI 各自实现。
- **本站无读者账号**（仅管理端 auth，`SPEC-ADMIN-AUTH-001`）：收藏采用本地优先方案，不以读者身份或收藏后端为前提；要引入读者体系属更大产品决策，单独立项。
- **页面级聚合**：一个 Mobile 页面对应一个页面级 HTTP/BFF 请求，响应统一为 `modules[]`；页面数据和导航数据来自同一次响应。
- **模块协议**：每个模块由前后端共同暴露的 `moduleKey` 唯一标识；不带 `version` 和布局字段。模块失败时从响应中省略，服务端记录日志，其他模块继续返回。
- **导航展示契约**：Mobile 导航模块返回 `leftIcons` 和 `rightIcons`；前端先过滤未知图标 ID，只展示合法项；请求或模块失败时不做默认导航兜底，按 fail fast 处理。
- **分享归因**：分享链接随页面级 BFF 数据返回，访问归因明细保留 90 天后删除。

## 当前基线（2026-10-01 现场核实）

- `components/mobile-nav.tsx`：仅品牌链接 + skip-link，无操作区。
- 详情页已有独立返回按钮（`pages/detail.tsx:15`，基于 `detail-input.ts` 的 `canReturnToSite` 策略）；导航级"后退"是策略复用与入口上移，不是从零做。
- "文章检索页"名不副实：`mobile-article-list`（`pages.registry.ts:153`）实为分类浏览页，仅读 `category_id`，无文字搜索——导航"搜索"入口指向的真实搜索面（含正文全文检索与高亮）由 `PLAN-SEARCH-001` 交付，本计划只做入口接线。
- 后端公开路由九个（articles、category-shelf、t-shelf、taxonomy、site-routes 等），**无导航动作 BFF 或分享归因端点**；收藏不新增后端端点，分享是否新增端点由契约闸门决定。
- Desktop 本轮不纳入。
- 图标库 lucide-solid 已在用；二期 perf 数字（切换传输、缓存命中、冷加载）是不可回归线。

## 更多菜单候选（供闸门，不预授权）

设置快捷入口、主题快速切换、复制链接、字号调节、文章目录（详情页 TOC）、随机漫游一篇。以现有能力（设置页、主题、检索）优先，避免菜单先于功能膨胀。

## 已确认决策

1. 收藏纯本地，不跨设备同步，不建立收藏后端。
2. 公开 Mobile 页面接入页面级 BFF；每页一次请求，聚合页面数据与模块数据。管理端 Mobile 预览继续使用管理接口和鉴权边界。
3. 页面响应使用 `modules[]`，元素为 `{ moduleKey, data }`；`moduleKey` 前后端都暴露，不带版本字段。
4. Mobile 导航使用页面上下文组合：详情页为 `leftIcons: [back]`、`rightIcons: [favorite, share, more]`，其他公开页为 `leftIcons: []`、`rightIcons: [search, more]`；后端返回实际列表，前端按列表渲染。
5. 前端过滤未知图标；未返回的图标不展示；模块失败不返回，服务端记录日志。
6. “更多”包含回首页、收藏、分享、设置、主题切换。
7. 分享链接随页面级 BFF 返回，需要归因；归因明细保留 90 天后删除。
8. 页面布局由前端控制；`pages.registry.ts` 保持现状，HTTP 配置继续沿用现有 API client 与 `docs/api/routes.json` 分工。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 契约草案 | frontend+backend | - | 页面级 BFF、`modules[]`、`moduleKey`、收藏本地格式、分享链接及归因草案 | completed |
| 后端页面聚合 | backend | 契约草案 | `src/core/protocol/`（wire/scene）、`src/backend/product/` 页面 BFF、分享归因、Spec、routes golden | completed |
| 共享逻辑包 | frontend | 契约草案 | `packages/`、协议类型、模块分发、图标过滤、分享链接、后退策略、单测 | completed |
| Mobile 页面接入 | frontend | 页面聚合 + 共享逻辑 | Mobile bootstrap、页面壳、导航组件、页面数据接线 | completed |
| 验收与收尾 | qa+pm | 接入完成 | E2E、验收证据、RESULT.md | completed |

## 成功标准

1. 契约冻结：页面级 BFF、`modules[]`、`moduleKey`、本地收藏格式和分享归因有生效 Spec；同步 `routes.json` golden、scene code。
2. 后端：页面数据与导航模块一次聚合返回；分享归因有 90 天明细清理和必要滥用防护；`cargo test` 与协议测试通过。
3. 共享包：平台中立（`ops package check` 通过）、单测齐全（对齐 codec 包模板）、两端可消费。
4. UI 接入：所有公开 Mobile 页面使用一次页面级请求；导航模块按 `leftIcons`/`rightIcons` 渲染页面上下文可用入口，覆盖后退、搜索、收藏、分享、更多五类能力，浏览器证据齐全。
5. 性能不回归：导航改动后 `ops perf mobile` 关键数字不劣化。
6. 相关 typecheck/lint/test/build 与 `ops quality check` 通过。

## 非目标

- 不引入读者账号体系或登录墙。
- 不改既有九个公开端点的语义；不动文章可见性、发布状态。
- 不在本计划内实现搜索本身（含正文全文检索与高亮，归 `PLAN-SEARCH-001`）；本计划只提供导航入口。
- 不合并 Desktop 与 Mobile UI；包不含任何 UI/DOM 代码。

## 约束与依据

- 依据：AGENTS 稳定边界（端隔离与共享范围）、`FACT-RUNTIME-001`（单机资源）、`SPEC-ADMIN-AUTH-001`（仅管理端鉴权现状）、一期体验计划对 P3 能力"单独讨论"的记录。
- **写集协调**：`PLAN-MOBILE-COMPONENT-EXPERIENCE-001`（active）正管 `mobile-nav.tsx` 与壳样式（吸顶修复、组件盘点）——本计划 Mobile UI 工作流与其直接重叠，实施前需互核写集。
- **衔接而非重造**：收藏的本地缓存优先消费 `PLAN-FRONTEND-CODEC-PERSISTENCE-001` 产出的 codec/persistence 原语，不另起序列化方案。
- 新增图标沿用 lucide-solid，不引入图标库；导航 bundle 增量需在 perf 验收中体现。

## 集成验收

1. 端到端旅程：所有公开 Mobile 页面一次请求完成页面与导航数据；后退、搜索、本地收藏、分享归因、更多菜单逐项可用。管理端预览仍按管理接口验证。
2. 页面 BFF golden、协议测试、模块失败隔离、归因保留 90 天和清理验证。
3. `ops package check`、两端 typecheck/build、E2E、`ops perf mobile` 对比。
4. `moduleKey` 注册与前后端协议校验；页面布局仍由前端控制。

## 当前执行范围

- 本轮只实现 Mobile；Desktop 后续另立计划。
- 页面级 BFF 只覆盖公开 Mobile 页面；管理端 Mobile 预览继续沿用 `adminArticle` API，不跨越 `SPEC-ADMIN-AUTH-001` 的鉴权边界。
- 页面注册表保持现状；新增能力落在现有 API client、protocol、Product BFF 和 Mobile 页面壳。
- 共享包名称和具体目录沿用现有 `@fluvient-loom/*` 组织方式，待契约草案按实际写集确定，不阻塞页面聚合实现。

## 本轮执行记录

- 已新增 `GET /api/public/mobile/page`，以 `modules[]` 聚合导航和页面数据，并同步 protocol scene、routes golden 与 Mobile API client；页面上下文决定图标列表，非详情页不展示收藏/分享顶部按钮。
- 已新增前端模块协议解析、合法图标过滤和页面级请求；首页、文章列表、文章详情、设置页均使用一次页面级请求。导航组件支持本地收藏、系统分享/剪贴板回退及更多菜单入口。
- 分享 token 访问写入 SQLite 归因表，事务内清理超过 90 天的明细并限制容量；token 仍由服务端做严格格式校验，迁移为 `0006_share_attribution.sql`。
- 已验证：`ops quality check` 全部通过，包含 Rust fmt/clippy/test、前端 typecheck/lint/format/test/build 和架构边界；`cargo test --workspace`、归因持久化与过期专测、Mobile API 测试（17 项）、`git diff --check` 均通过。Mobile 导航组件只消费接口层归一化后的 `MobileNavigation`，浏览器能力由 bootstrap 端口注入。
- 已完成验证：`ops package check`、`ops quality check`、`cargo test --workspace`、归因持久化与过期专测、Mobile API 测试（17 项）、浏览器 E2E、Mobile 性能采样和 `git diff --check` 均通过，证据见 `RESULT.md`。
