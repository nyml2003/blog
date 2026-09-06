---
kind: spec
id: SPEC-MOBILE-BROWSE-IA-001
status: accepted
owner: frontend-mobile
plan_id: PLAN-MOBILE-BROWSE-IA-001
last_reviewed: 2026-09-07
---

# C Mobile 文章浏览信息架构：货架快照 + F 型平铺页

## 目标

将 Mobile 文章浏览重构为“楼层快照 + 平铺检索”双层：货架页回归纯发现（推荐 + 各类型前 N + 查看全部），新增 F 型三级级联平铺页承载检索与分页（加载更多）。公开端移除日期筛选（含旧 FilterPanel）；数据模型与 term 层级不变。

## 非目标

- 不做 Desktop T 型与 Desktop 分页（另立计划）；
- 不给 term 增加父子层级，不做主题/标签多选筛选；
- 不在本计划实现管理页筛选（日期筛选"留给管理页"是归属声明，管理页改造另行立项）；
- 不做无限滚动 / 自动加载（用显式"加载更多"按钮）;
- 不修改文章详情、首页推荐、设置页。

## 契约

- **货架快照**（`/api/public/mobile/article-shelf` wire 变更）：推荐区固定 3；各类型区截断至前 `N = 6`；每个分区携带 `total`；服务端不再全量下发文章（响应条数有界）。`N` 为常量，首次落地取 6。
- **分区入口**：仅当分区 `total > N` 时展示"查看全部"，链接到平铺页并携带该类型。
- **平铺页**（新 MPA 入口 `/m/articles/list.html`）：F 型三级，全部单选、条件 AND：
  - L1 左侧 tab = 文章类型（全部 + 各类型）；
  - L2 横向 = 主题 topic（全部 + 各 topic，taxonomy 数据）；
  - L3 横向 = 标签 tag（全部 + 各 tag），仅当 L2 选择了具体主题时出现；L3 与 L2 无父子语义，为并列维度；
  - 选择变化重置为第 1 页并同步 URL（`?type=&topic=&tag=`，可分享 / 可后退）。
- **分页**：消费新浏览接口 `/api/public/articles?sceneCode=public.article_browse`（决策记录 #7：不改共享 `term_ids` OR 语义）。参数 `type_id?` / `topic_id?` / `tag_id?`（单选，维度间 AND；`topic_id` / `tag_id` 需与 term `kind` 匹配）+ `page` / `pageSize`（默认 20 / 上限 100），响应沿用列表分页形态（items + page/pageSize/total）；显式"加载更多"按钮追加下一页，按钮展示进度（已载 / 总数），无更多时禁用或隐藏；页码不进 URL。`public.article_list` 契约不变。
- **公开端日期移除**：公开页面不再出现创建 / 更新日期筛选；URL 中遗留的旧日期参数被忽略并清理。
- **组件纪律**：新页面与货架改造优先消费既有九原子；出现能力缺口（tab、横向 chips 等）必须停下向用户报备裁决，不得擅自扩原子面或绕过 Props 契约。

## 场景

### SPEC-MOBILE-BROWSE-IA-001-001

Given 用户打开 Mobile 文章货架页（无筛选）

Then 页面为纯快照：推荐区 3 张 + 各类型区前 6 张 + scrollspy 分区导航，无筛选面板入口

And 每个总数超过 6 的分区尾部有"查看全部"，不超过 6 的分区没有

### SPEC-MOBILE-BROWSE-IA-001-002

When 用户点击某类型区"查看全部"

Then 进入 `/m/articles/list.html?type=<该类型>`，L1 定位到该类型，列表从第 1 页加载

### SPEC-MOBILE-BROWSE-IA-001-003

Given 用户在平铺页

When 依次选择 L1 类型、L2 主题

Then 列表按"类型 AND 主题"过滤并重置到第 1 页，URL 同步为 `?type=&topic=`

And L2 选了具体主题后 L3 标签条出现；选择 L3 后过滤条件为三级 AND，URL 同步

When 任一级切回"全部"

Then 对应条件移除，列表重置第 1 页

### SPEC-MOBILE-BROWSE-IA-001-004

Given 平铺页当前筛选下还有未加载文章

When 用户点击"加载更多"

Then 追加下一页（pageSize 20），按钮进度更新；加载失败可重试且不丢已加载内容

When 已加载条数达到 total

Then 不再提供加载更多

### SPEC-MOBILE-BROWSE-IA-001-005

Given 带旧日期参数的 URL（如 `?created_from=2024-01-01`）

When 打开货架页或平铺页

Then 日期参数被忽略并从 URL 清理，页面正常渲染

### SPEC-MOBILE-BROWSE-IA-001-006

Given 任一公开 Mobile 页面

Then 不存在日期筛选输入；旧 FilterPanel（checkbox + 日期面板）代码下线

### SPEC-MOBILE-BROWSE-IA-001-007

Given 货架 BFF 响应

Then 分区文章数不超过 N + 推荐 3，响应体积随文章总量增长有界；每分区 total 与该类型全量计数一致

### SPEC-MOBILE-BROWSE-IA-001-008

Given 本计划改动的移动端页面

Then 首页、详情、设置页行为不变；`pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿

## 边界与失败

- 平铺页数据端点失败：显示既有错误态与重试，不白屏；
- taxonomy 加载失败：L1 仍显示"全部"，级联条降级为不可用或重试，不阻塞"全部"列表；
- 分区 total 与实际列表不一致以列表端点 total 为准（货架 total 仅用于入口判断）；
- 多 term 的跨维度组合（topic AND tag）通过新接口分参表达，不改 `public.article_list` / `admin.article_list` 的 `term_ids`（同维度 OR）语义（2026-09-06 用户裁决，见计划决策记录 #7）；
- 与在途计划的写集协调：`ui.tsx`、`vite.config.ts`、`client.ts` 存在他计划写集，必须串行并逐项复核。

## 测试/验收证据

- 自动化测试（2026-09-07，全绿）：
  - 后端：`cargo test --manifest-path src/Cargo.toml --workspace` 110 passed / 0 failed（PM 独立复跑确认），含 wire 单测（截断 6 / total / camelCase）、product 契约 `shelf_sections_are_bounded_and_browse_filters_are_and`（>6 篇造数：推荐 3 / type 分区 6 张 + total 7 / 下发卡片总数有界断言 / 三维 AND / kind 错配 400 / 分页归一化与越界 hasMore / `public.article_list` OR 语义与 `topic_id` 忽略锚定）、mock http 契约同组断言、`static_files.rs` 路由唯一性/覆盖单测；fmt + clippy 零告警；
  - 前端：`pnpm --dir src/frontend typecheck / lint / build / test:core` 四命令全绿，test:core 48/48（含 `browse-filter.test.ts` 10 条：URL 解析/级联重置/日期参数清理/`nextBrowsePage`；client 测试锚定 browse URL 形态与货架无参请求）；
- 集成联调（ops runtime integration，独立端口 + 临时库，43 篇 Engineering + 6 篇 Field Notes 造数）：API 断言 13/13，浏览器断言 17/17（playwright 375x812，覆盖场景 001–006：无筛选入口、查看全部跳转定位、三级级联 + URL 同步 + 后退恢复、加载更多到底、旧日期参数清理、L3 出现/消失；截图 `/tmp/blog-browse-evidence/{shelf,flat-page}-375.png`，PM 目验）；
- 场景 007（响应有界）：下发卡片总数 ≤ 分区数 × 6 + 推荐 3 有自动化断言 + 联调实测（6 分区 14 卡 / 51 篇全量）；
- 场景 008：首页 / 详情 / 设置回归 = 三页仅 filter.css import 移除，四命令 + 浏览器走查通过；
- 人工验收：**2026-09-07 用户验收通过**（夹具扩量至 45 篇 published 后 dev 模式全场景走查：货架快照 / 查看全部 / 三级级联含空态 / 加载到底 / 旧日期参数清理 / 首页详情设置回归；观察项 375px L1 长类型名截断用户接受，与货架现状一致）。
