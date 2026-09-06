---
kind: spec
id: SPEC-FRONTEND-T-SHELF-001
status: draft
owner: frontend
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
last_reviewed: 2026-09-07
---

# 公开端 T 型货架与 Mobile F 型边界

## 目标

统一公开端展示货架的视觉与数据交互：Mobile 文章 list 页及其二级页使用既有 F 型信息架构，其余公开展示货架使用 T 型结构。T 型结构顶部为可切换筛选项，下方为当前筛选项对应的文章区。

## 决策记录（用户已定）

1. Mobile `/m/articles/index.html` 与其二级 `/m/articles/list.html` 使用 F 型货架；
2. 其他公开展示货架使用 T 型货架；
3. 首次请求同时取得筛选数据和第一个筛选项对应的文章数据；
4. 切换筛选项后重新请求文章数据并重新渲染；
5. 管理端文章表格属于操作界面，不纳入展示货架形态规则；
6. 最终产品验收由用户执行。

## 契约

- T 型适用面：Desktop 首页的推荐/文章货架、Desktop 文章列表页、Mobile 首页推荐货架，以及后续新增的公开展示货架；
- F 型适用面：Mobile `/m/articles/index.html` 货架快照页与 `/m/articles/list.html` 三级平铺检索页，继续遵守 `SPEC-MOBILE-BROWSE-IA-001`；
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

Then `/m/articles/index.html` 仍是 F 型货架快照，`/m/articles/list.html` 仍是 F 型三级平铺检索，既有层级与交互不回归

## 测试/验收证据

- 自动化：API 契约、Product/Mock 对齐、查询竞态、页面切换/空态/失败/重试，以及 Mobile F 型回归；
- 浏览器：Desktop 与 Mobile 代表视口截图、交互与无横向溢出检查；
- 人工：最终视觉和产品验收由用户执行。
