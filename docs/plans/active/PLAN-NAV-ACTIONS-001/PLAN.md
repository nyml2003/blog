---
kind: plan
id: PLAN-NAV-ACTIONS-001
status: ready
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# 顶部导航操作：后退 / 搜索 / 收藏 / 分享 / 更多

## 目标

把 Mobile 顶部导航栏从"仅品牌链接"升级为操作入口：**后退、搜索、收藏、分享、更多**（更多菜单含回到首页、收藏、分享及闸门确认的补充项）。同一能力 Desktop 也要有，但放置位置不限于导航栏。导航项和可用状态由后端 BFF 下发，前端只根据契约渲染，不在两端重复维护产品清单。

产品指定的推进顺序：**先冻结契约 → 抽共享逻辑 npm 包 + 后端改动 → 后续再接入两端 UI**。导航 BFF 是本计划的公共契约；分享归因只有在确认需要服务端记录时才新增 API。收藏与分享属于一期体验计划中明确"单独讨论"的 P3 产品能力，本计划即为该讨论与落地载体。

## 关键架构边界（先钉死，方案不越界）

- **npm 包不承载 UI**：Desktop 与 Mobile 的页面、DOM、CSS、交互相互隔离是项目稳定边界。共享包只能承载协议类型、API client、分享链接构造、后退策略等纯函数与数据语义；两端 UI 各自实现。
- **本站无读者账号**（仅管理端 auth，`SPEC-ADMIN-AUTH-001`）：收藏采用本地优先方案，不以读者身份或收藏后端为前提；要引入读者体系属更大产品决策，单独立项。
- **导航清单由 BFF 下发**：后端负责当前页面可用动作、顺序及必要参数的编排；protocol 只描述稳定数据形状，Desktop 与 Mobile 各自渲染。
- **分享归因是否需要新公共 API**：分享链接可以在进入页面时或客户端按规范生成；只有需要服务端记录归因时才新增端点，并同步 Spec、scene code、`docs/api/routes.json` golden 和滥用防护。

## 当前基线（2026-10-01 现场核实）

- `components/mobile-nav.tsx`：仅品牌链接 + skip-link，无操作区。
- 详情页已有独立返回按钮（`pages/detail.tsx:15`，基于 `detail-input.ts` 的 `canReturnToSite` 策略）；导航级"后退"是策略复用与入口上移，不是从零做。
- "文章检索页"名不副实：`mobile-article-list`（`pages.registry.ts:153`）实为分类浏览页，仅读 `category_id`，无文字搜索——导航"搜索"入口指向的真实搜索面（含正文全文检索与高亮）由 `PLAN-SEARCH-001` 交付，本计划只做入口接线。
- 后端公开路由九个（articles、category-shelf、t-shelf、taxonomy、site-routes 等），**无导航动作 BFF 或分享归因端点**；收藏不新增后端端点，分享是否新增端点由契约闸门决定。
- Desktop 无统一 header 组件（`desktop/components/` 仅三个业务组件），放置位是设计题。
- 图标库 lucide-solid 已在用；二期 perf 数字（切换传输、缓存命中、冷加载）是不可回归线。

## 更多菜单候选（供闸门，不预授权）

设置快捷入口、主题快速切换、复制链接、字号调节、文章目录（详情页 TOC）、随机漫游一篇。以现有能力（设置页、主题、检索）优先，避免菜单先于功能膨胀。

## 决策闸门（产品决策，实现前确认）

1. **收藏本地契约**：收藏键、存储版本、容量上限、失效与跨会话行为；优先复用 `PLAN-FRONTEND-CODEC-PERSISTENCE-001` 的原语，不建立收藏后端。
2. **分享模型**：链接是否在进入页面时生成或由客户端生成；若需要归因，确定 query 参数/短链 token、采集端点、数据保留期与聚合口径。
3. 更多菜单最终清单与优先级。
4. Desktop 放置位置与形态（页头工具区、侧栏、文章操作条等）。
5. 搜索入口指向：`PLAN-SEARCH-001` 交付搜索面之前，导航搜索入口是先指向现有列表页占位、还是随检索专项一起上线。
6. 导航 BFF 的响应契约：动作 id、顺序、可见性/禁用状态、目标及参数，以及页面上下文。
7. 若分享需要服务端归因，新 API 的 Spec 范围与滥用防护要求。
8. 共享包名与边界（`@fluvient-loom/*`，与既有 `port`/`common`/`query` 的关系）。
9. 本轮范围确认：默认交付到"契约冻结 + 导航 BFF + 分享必要后端 + 包"，两端 UI 接入是否本轮尾段纳入或拆独立计划。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 契约草案 | frontend+backend | - | 导航 BFF、收藏本地格式、分享链接及必要 API 草案、包边界提案（本目录留档） | ready |
| 决策闸门 | 产品+pm | 契约草案 | 本 PLAN.md 范围确认、新 Spec 立项 | blocked |
| 后端实现 | backend | 闸门 | `src/core/protocol/`（wire/scene）、`src/backend/product/` BFF、分享必要端点、Spec、routes golden | blocked by 闸门 |
| 共享逻辑包 | frontend | 契约冻结 | `packages/`（闸门定名）、协议类型、导航动作类型、分享链接构造、后退策略、单测 | blocked by 闸门（可与后端并行） |
| Mobile 导航 UI 接入 | frontend | 包 + 后端就绪、与组件体验计划协调 | `components/mobile-nav.tsx`、`ui/molecules/`、mobile styles、页面接线 | pending（闸门定是否本轮） |
| Desktop 接入 | frontend | 同上 + 放置位决策 | Desktop 对应 shell/页面组件 | pending |
| 验收与收尾 | qa+pm | 接入完成 | E2E、验收证据、RESULT.md | pending |

## 成功标准

1. 契约冻结：导航 BFF 与本地收藏格式有生效 Spec；若启用服务端分享归因，则同步其 API、`routes.json` golden、scene code。
2. 后端：导航 BFF 实现；若分享需要归因，再增加端点、滥用防护（限速/容量上限）及必要迁移；`cargo test` 与协议测试通过。
3. 共享包：平台中立（`ops package check` 通过）、单测齐全（对齐 codec 包模板）、两端可消费。
4. UI 接入（若本轮）：Mobile 导航含五类入口且浏览器证据齐全；Desktop 等价能力不同位置。
5. 性能不回归：导航改动后 `ops perf mobile` 关键数字不劣化。
6. 相关 typecheck/lint/test/build 与 `ops quality check` 通过。

## 非目标

- 不引入读者账号体系或登录墙。
- 不改既有九个公开端点的语义；不动文章可见性、发布状态。
- 不在本计划内实现搜索本身（含正文全文检索与高亮，归 `PLAN-SEARCH-001`）；本计划只提供导航入口。
- 不合并 Desktop 与 Mobile UI；包不含任何 UI/DOM 代码。

## 约束与依据

- 依据：AGENTS 稳定边界（端隔离与共享范围）、`FACT-RUNTIME-001`（单机资源）、`SPEC-ADMIN-AUTH-001`（仅管理端鉴权现状）、一期体验计划对 P3 能力"单独讨论"的记录。
- **写集协调**：`PLAN-MOBILE-COMPONENT-EXPERIENCE-001`（active）正管 `mobile-nav.tsx` 与壳样式（吸顶修复、组件盘点）——本计划 Mobile UI 工作流与其直接重叠，必须串行并在实施前互核；建议其先行落地，本计划 UI 阶段基于其产出。
- **衔接而非重造**：收藏的本地缓存优先消费 `PLAN-FRONTEND-CODEC-PERSISTENCE-001` 产出的 codec/persistence 原语，不另起序列化方案。
- 新增图标沿用 lucide-solid，不引入图标库；导航 bundle 增量需在 perf 验收中体现。

## 集成验收

1. 端到端旅程：导航后退策略（同源回退/回首页）、搜索跳转、本地收藏增删查（含跨会话保持）、分享链接生成 → 无痕窗口访问；若启用服务端归因，再验证归因记录可查、更多菜单逐项。
2. 导航 BFF golden、协议测试；若启用服务端归因，再进行 API golden 和滥用防护演练（超限请求被拒且不影响服务）。
3. `ops package check`、两端 typecheck/build、E2E、`ops perf mobile` 对比。
4. Desktop 与 Mobile 能力等价性清单核对（同一命令/数据，不同位置）。

## 未决项

- 分享链接生成方式，以及是否需要服务端归因 API。
- 导航 BFF 响应契约。
- 本地收藏的存储版本与容量策略。
- 更多菜单最终清单。
- Desktop 放置位置。
- 共享包命名。
- 两端 UI 是否本轮纳入。
