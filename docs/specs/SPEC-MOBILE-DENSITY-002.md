---
kind: spec
id: SPEC-MOBILE-DENSITY-002
status: accepted
owner: product
plan_id: PLAN-MOBILE-DENSITY-002
last_reviewed: 2026-09-05
---

# C Mobile 详情页与正文密度

## 范围

本 Spec 只约束 C Mobile 文章详情页和已有 Mobile 正文主题 wrapper。推荐页、文章库、PC、B 端、领域模型和公共 API 不在实现范围内。

## 场景

### SPEC-MOBILE-DENSITY-002-DETAIL-001

Given 用户从文章库打开一篇已发布文章
When 详情页加载完成
Then 阅读栏提供单一顶部返回入口，标题完整可读，正文更早进入首屏，详情页不显示底部双项导航

### SPEC-MOBILE-DENSITY-002-DETAIL-002

Given 文章有类型、摘要、主题/标签和更新时间
When 用户查看标题区
Then 类型、完整标题、摘要和一行紧凑元数据按固定层级呈现，标签最多显示两项并以 `+N` 表示溢出，不复制创建时间或公开状态

### SPEC-MOBILE-DENSITY-002-DETAIL-003

Given 文章没有摘要或标题较长
When 用户阅读详情页
Then 摘要不渲染虚假占位，标题不被截断、不覆盖相邻内容，正文和底部返回入口仍可到达

### SPEC-MOBILE-DENSITY-002-DETAIL-004

Given 正文包含标题、段落、列表、代码、引用、表格、图片和链接
When 用户在 `375x812` 或 `812x375` 视口阅读
Then 正文保持至少 `16px` 字号和约 `1.7` 行高，页面无横向溢出，代码/宽表格只在自身容器内滚动，图片不超出内容宽度

### SPEC-MOBILE-DENSITY-002-DETAIL-005

Given 用户从筛选后的文章库进入详情、直接打开详情 URL 或在新标签打开详情
When 用户点击顶部/底部返回或使用系统返回
Then 同源文章库来源优先恢复原历史，无法确认来源时回到 `/m/articles/index.html`，不回退到站外页面

### SPEC-MOBILE-DENSITY-002-DETAIL-006

Given 详情页处于加载、缺少 ID、文章不存在、文章不可见或接口错误
When 用户查看状态或点击重试
Then 阅读栏和状态反馈保持稳定，错误使用 `alert` 语义，重试控件触控盒至少 `44px`

## 验收阈值

- canonical 短标题、有摘要样本的正文入口不超过 `300px`，且相对改动前减少至少 `20%`；
- 所有可操作控件最小为 `44x44px`，相邻目标至少间隔 `8px`；
- `document.documentElement.scrollWidth` 等于 `clientWidth`；代码和表格允许内部横向滚动；
- reduced-motion 下不播放非必要动画，正文与标题无可见重叠或布局抖动。

## 边界

- 摘要为空时省略摘要节点；不修改摘要 API 或正文 HTML 片段契约。
- 压力样本可以来自临时数据库副本，但不得写入正式 `blog.db`。
