---
kind: workstream
id: WORKSTREAM-MOBILE-DENSITY-VISUAL
status: completed
plan_id: PLAN-MOBILE-DENSITY-001
role: visual-design
owner: visual-design
depends_on: [WORKSTREAM-MOBILE-DENSITY-PRODUCT]
write_set: [docs/architecture/ui-ux.md, docs/plans/active/PLAN-MOBILE-DENSITY-001/WORKSTREAM-VISUAL.md]
last_reviewed: 2026-09-05
---

# 移动端密度与状态规范

## 目标

建立紧凑但可读的移动端视觉规则，减少装饰性留白，把空间让给可扫描内容，并将页面级分区 F 型 Shelf 固化为归档页的首选布局。

## 输入

- 产品工作流的页面清单和信息优先级；
- 现有系统主题令牌；
- UI/UX Pro Max 的触控、内容截断、布局稳定性和无横向滚动规则。

## 输出

- 页面级间距、条目高度、摘要行数和元数据排列规则；
- F 型 Shelf 的结构规范：左侧 sticky 分区 Tab、右侧连续 section、推荐区和类型区；
- Filter 入口、结果状态、底部面板/SlideModal 的移动端行为；
- 加载、空、错、无摘要和无标签状态的视觉规格。
- 页面级 F-Shelf 的实现级几何、Scrollspy 状态和无抖动边界，供 Mobile 前端直接验收。

## 实施任务

- 默认采用页面级 F 型 Shelf，避免把类型标签重复放入每条卡片；推荐区最多 3 张卡片，后续按类型分区；
- 左侧分区 Tab 保持固定宽度和稳定对齐，active 样式不得改变几何尺寸；
- 卡片标题、摘要、标签和元数据保留稳定行框，空摘要也占用同等空间；
- 布局尺寸变化不得在滚动期间触发可见抖动，必要时由前端 LayoutSnapshot 补偿；
- 筛选条件在顶部形成单一操作带，打开筛选面板后从底部上滑，不在每条文章上重复放筛选控件；推荐/归档页底栏替换顶部主导航；
- 将标签、类型和时间组织为一行或两行低噪声元数据；
- 只保留能帮助决策的摘要，超出行数使用省略并可进入详情；
- 规定安全区、滚动锁定、Escape/返回、提交中反馈和 reduced-motion 行为。

## 测试/验收

- 在窄屏下无横向滚动，文字不溢出容器；
- F 型 Shelf 的左侧锚点、标题和摘要在连续条目之间保持可预测对齐；
- 主要控件触控区域至少 `44px`，相邻控件保留足够间距；
- 加载前后结构尺寸稳定，空状态不只显示空白。

## 阻塞

无。

## 交付记录

2026-09-05：原有“每条文章左侧类型锚点”定义被用户否定；本工作流改为页面级分区导航、固定卡片几何和无抖动状态规范，待 BFF 契约后落地。

2026-09-05：补齐视觉契约：`76px` sticky 左轨、右轨 section/card 结构、标题/摘要/标签截断、44px 触控、active 指示线、加载/空/错占位、筛选提交保高和 ResizeObserver 锚点补偿边界。实现仍等待 BFF sections 和 Mobile 前端接入。

2026-09-05：BFF 和 Mobile 实现已接入；用户确认目标 Tab 锁定和非几何 active 动效的实际交互满足预期。
