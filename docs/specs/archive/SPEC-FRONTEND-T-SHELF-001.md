---
kind: spec
id: SPEC-FRONTEND-T-SHELF-001
status: archived
owner: frontend
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
last_reviewed: 2026-09-10
---

# 公开端 T 型货架与 Mobile F 型边界

## 目标

统一公开端展示货架的视觉与数据交互：Mobile 两个文章入口使用 F 型信息架构，其余
公开展示货架使用 T 型结构。T 型结构顶部为可切换筛选项，下方为当前筛选项对应的
文章区；F 型内部分类树行为以 `SPEC-CONTENT-TAXONOMY-001` 为准。

## 决策记录（用户已定）

1. Mobile `/m/articles/index.html` 与其二级 `/m/articles/list.html` 使用 F 型货架；
2. 其他公开展示货架使用 T 型货架；
3. 首次请求同时取得筛选数据和第一个筛选项对应的文章数据；
4. 切换筛选项后重新请求文章数据并重新渲染；
5. 管理端文章表格属于操作界面，不纳入展示货架形态规则；
6. 最终产品验收由用户执行。

## 契约

- T 型适用面：Desktop 首页的推荐/文章货架、Desktop 文章列表页、Mobile 首页推荐货架，以及后续新增的公开展示货架；
- F 型适用面：Mobile `/m/articles/index.html` 与 `/m/articles/list.html`；两者均采用
  左侧一级分类、右侧二级 tabs、下方文章卡片，父级汇总按文章去重，遵守
  `SPEC-CONTENT-TAXONOMY-001`；旧 `SPEC-MOBILE-BROWSE-IA-001` 中冲突的快照、三级
  平铺和加载更多语义不再适用；
- 初始响应包含有序筛选项、明确的首个/当前筛选标识、该筛选项对应的文章数据和总量；页面不得另发一次请求才能得到首屏文章；
- 切换筛选项时页面携带稳定筛选标识重新请求文章数据；新选择立即成为当前意图，旧请求晚到时不得覆盖新选择的数据；
- 初始加载、切换加载、空态、失败和重试必须各自可辨，失败不得清除可继续使用的筛选项；
- Desktop 与 Mobile 分别实现 DOM、CSS 和组件；只共享请求/响应契约与无 UI 查询逻辑；
- Product 与 Mock Product 对同一请求必须返回同构响应并遵守相同错误语义。

## 场景

### SPEC-FRONTEND-T-SHELF-001-001

Given 用户首次进入 T 型货架页面

When 页面发出初始请求

Then 单次响应包含全部有序筛选项和第一个筛选项对应的文章数据，页面按该顺序渲染筛选区与文章区

### SPEC-FRONTEND-T-SHELF-001-002

Given T 型货架已加载

When 用户切换筛选项

Then 页面重新请求该筛选项的文章数据并重新渲染文章区，同时保持筛选区稳定

### SPEC-FRONTEND-T-SHELF-001-003

Given 用户连续切换筛选项且请求乱序返回

When 较早请求晚于最新请求完成

Then 较早响应被取消或忽略，文章区只展示最新选择对应的数据

### SPEC-FRONTEND-T-SHELF-001-004

Given 请求处于加载、空结果或失败状态

Then 页面分别展示稳定的加载、空态或错误/重试界面，且不会因动态内容改变造成筛选区布局跳动

### SPEC-FRONTEND-T-SHELF-001-005

Given 用户进入 Mobile 两个文章浏览入口

Then 两个入口均保持 F 型边界并展示相同的一级/二级分类货架；分类切换重新请求，
父级汇总不重复文章，loading 不卸载 tabs 或丢失焦点，分类 Back 和详情返回恢复 URL、
选择与滚动位置

## 测试/验收证据

- API（2026-09-07）：Product→Data 真实链路与 Mock HTTP 契约覆盖 `recommendation` / `archive` 初始 `all`、类型切换、推荐范围、非法参数及既有 Mobile F 型回归；Rust workspace tests 通过。
- 查询与 client（2026-09-08）：测试覆盖初始请求、筛选序列化、响应解码、快速切换时
  旧响应丢弃，以及分类 history 保存、最终响应 ready gate 和恢复调度；前端核心测试
  107/107、Native/WASM parity 287 通过。
- 浏览器（2026-09-08 06:56，Asia/Shanghai）：Desktop/Mobile T 型筛选和两个 Mobile
  分类 F 型入口由 `18084/18085` 的 fixture 同源 integration 验证。最终 52 项脚本连续
  两次通过：一级/二级切换和 refetch、父级汇总去重、loading rails/focus、两个入口
  分类 Back、index 详情返回均通过，页面错误 0。
- 总门禁（2026-09-08）：前端 typecheck、lint、format、build，以及项目
  `ops quality check` 全部通过。
- 人工：代码与自动化验收完成；最终视觉和产品验收由用户执行。
