# R0 分层边界审查报告

审查日期：2026-09-07

## 审查结论

当前主要腐化源集中在三处：页面直接装配 client/resource、Product `http.rs` 同时承担协议适配和业务编排、protocol `wire.rs` 承担货架分组与兜底规则。Data 的 SQL 仍收敛在 `backend/data/src/store/sqlite.rs`，Product 未直接访问 SQLite；Mobile UI 原子/分子未发现直接请求 client 的新增违规。

用户已审定查询层落位为 `src/frontend/solid/queries/`。该目录只共享无 UI 的页面查询用例；Desktop 与 Mobile 的 DOM、CSS、组件和交互状态继续隔离。

## 前端违规清单

以下行号是 R0 审查快照，后续迁移以文件和违规类型为稳定标识。

| 位置 | 违规与严重度 | 目标层与迁移策略 | 写集协调 |
| --- | --- | --- | --- |
| `desktop/src/pages/public/home.tsx:4` | 页面直接 import client/resource，并组装推荐与文章筛选查询；阻塞级 | 在 `solid/queries` 建公开首页用例，页面只读取查询状态和触发 UI 意图 | 与 PAGE-TEMPLATE 页面迁移串行 |
| `desktop/src/pages/public/articles.tsx:3` | 页面维护筛选到请求参数映射；阻塞级 | 建文章列表查询用例，参数归一化和错误语义移入查询层 | 同上 |
| `desktop/src/pages/public/detail.tsx:4` | 页面直接调用详情 client；高 | 建公开详情查询用例；无效 ID 在查询层返回明确失败任务 | 同上 |
| `mobile/src/pages/home.tsx:4` | 页面直接装配推荐查询；高 | 建 Mobile 首页用例并复用无 UI 查询机制 | 同上 |
| `mobile/src/pages/articles.tsx:21` | F 型货架页直接装配 shelf client/resource；阻塞级 | 建货架查询用例，保留 Mobile 独立 UI | 与既有 Browse IA 代码共同回归 |
| `mobile/src/pages/article-list.tsx:12` | 类型、term、分页请求和 fallback 分散在页面；阻塞级 | 建 F 型浏览查询用例，统一首次加载、分页、错误和重试 | 同上 |
| `mobile/src/pages/detail.tsx:5` | 页面现场创建无效 ID 的失败任务；高 | 把 ID 解析、fallback 与请求放进详情查询用例 | 与 PAGE-TEMPLATE 页面迁移串行 |
| `desktop/src/pages/admin/{home,taxonomy,editor,html-inspection,article-preview}.tsx` | 管理页面直接 import client/data/resource，editor 还组装写入 payload；阻塞级 | 按管理首页、分类、编辑、校验、预览拆查询/命令用例；写入 payload 由查询层构造 | 尊重 CONTENT-TRUTH / EDITOR 已交付代码，基于当前实况迁移 |
| `mobile/src/pages/admin-preview-content.tsx:6` | 预览内容页直接装配 client/resource；高 | 建预览查询用例 | 与 PAGE-TEMPLATE 页面迁移串行 |
| `desktop/src/app.tsx:2` | 旧入口自身包含数据读取与页面 UI，组合根白名单范围过宽；高 | 组合根仅保留 transport 注入，查询逻辑移入查询层 | 迁移后由门禁锁定白名单 |

`desktop/src/pages/admin/article-source-editor.tsx`、`editor-codemirror.ts` 对 `common/data/readonly` 的类型 import 不属于数据获取，但仍违反“页面不得 import common/data”的机械规则；迁移时应把共享只读类型移到中性契约位置或由查询层对外导出，不能为其保留永久豁免。

## 后端违规清单

| 位置 | 违规与严重度 | 目标层与迁移策略 | 写集协调 |
| --- | --- | --- | --- |
| `product/src/http.rs:217` 至货架响应分支 | handler 决定 `include_recommendation`、判断 `has_filters` 并调用货架组装；阻塞级 | HTTP 只解析类型化 query 并调用 Product BFF；推荐开关、聚合和输出选择移入 BFF | 按 CONTENT-TRUTH 部分交付后的当前文件迁移 |
| `core/protocol/src/operation.rs:273` | Data operation 输入携带 Product 展示决策 `include_recommendation`；阻塞级 | Data 只接受类型化读取条件；推荐读取/组合由 Product BFF 发起 | 与 Product BFF 同轮迁移 |
| `core/protocol/src/wire.rs:291`、`:321` | protocol 创建推荐 section、按类型分组、控制空 section、生成“未分类”兜底；阻塞级 | protocol 保留 DTO 与纯字段映射；整体 `to_shelf` 编排移到 Product BFF | 与 Product BFF 同轮迁移 |
| `product/src/http.rs:444` 起管理内容 handler | HTTP 层含 HTML 检查和写入流程决策；中 | 本计划只登记，不在“内部实现不动”的范围内扩做；后续由 CONTENT-TRUTH 续作判断领域服务落位 | 当前为 CONTENT-TRUTH 部分交付实况 |

Data 边界扫描未发现 `backend/data` 访问 GitHub；SQL 访问集中在 Data store。Data 保存与返回 HTML 字段属于持久化契约，未发现其解析或改写 HTML 的越权实现。

## 门禁与 Golden 初始清单

- 页面禁用 `common/client`、`common/data`、`solid/data` 的规则需要覆盖 `desktop/src/pages` 与 `mobile/src/pages`，只允许明确登记的组合根 transport 注入；
- 查询层禁止 import Desktop、Mobile、mobile-ui、DOM 或 Solid UI 组件；
- `common/client` 禁止 import Solid 或 DOM；
- Product 除 `data_client` 外禁止 SQL/SQLite 依赖，Data 禁止 GitHub 与 HTML parser 依赖；
- API golden 使用中性数据文件记录 `method + endpoint + sceneCode`，Rust 和 TypeScript 分别验证实现覆盖；不引入双语言 codegen。

R0 后的临时豁免仅允许覆盖上表存量路径，并必须随 R2/R3 清零。任何新增路径或新增直接 import 都应立即被门禁拒绝。

## R0 交付决定

1. 查询层位置：`src/frontend/solid/queries/`（用户已定）；
2. 前端迁移单位：先查询用例，后按页面写集串行替换；
3. 后端迁移单位：先建立 Product BFF，再把 `http.rs` 和 `wire.rs` 的决策移入；
4. CONTENT-TRUTH 部分交付代码不按旧假设覆盖，所有迁移基于 2026-09-07 当前实况；
5. R1 门禁可按本报告的稳定文件/依赖类别实现，R2/R3 完成时豁免必须归零。
