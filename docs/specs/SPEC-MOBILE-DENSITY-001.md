---
kind: spec
id: SPEC-MOBILE-DENSITY-001
status: accepted
owner: product
plan_id: PLAN-MOBILE-DENSITY-001
last_reviewed: 2026-09-05
---

# C Mobile 信息密度与导航

## 目标

在不牺牲触控和阅读可用性的前提下，让推荐和归档页面在固定手机视口中提供稳定、连续的文章扫描路径。

## 场景

### SPEC-MOBILE-DENSITY-001

Given 推荐页在 `375x812` 竖屏
When 推荐接口返回至少 4 篇文章
Then 首屏显示标题、推荐数量、摘要、关键元数据和至少 4 条完整文章行

### SPEC-MOBILE-DENSITY-002

Given 文章库在 `375x812` 竖屏
When Mobile Shelf BFF 返回推荐和多个文章类型 section
Then 左侧显示页面级分区导航，右侧按 section 连续显示推荐卡片和类型文章卡片

### SPEC-MOBILE-DENSITY-003

Given 用户打开或修改筛选
When 关闭、清除、应用或使用系统返回
Then 筛选状态可见、可恢复，筛选参数行为保持不变，底部面板管理焦点和背景滚动；Shelf 滚动和分区点击不修改 URL 或浏览器历史

### SPEC-MOBILE-DENSITY-004

Given 文章存在长标题、空摘要或空标签
When 用户浏览文章行
Then 文本按固定规则截断或显示明确空状态，行不横向溢出，进入详情可读取完整内容

### SPEC-MOBILE-DENSITY-005

Given 页面处于加载、空结果或接口错误
When 用户等待或点击重试/清除
Then 结构尺寸稳定，状态有明确反馈和恢复路径

### SPEC-MOBILE-DENSITY-007

Given 用户在文章库中滚动或点击左侧分区导航
When 当前 section 变化或目标 section 被定位
Then 左侧 active 分区同步更新；定位使用页面滚动，不卸载其他 section，不因 active 样式改变布局尺寸

### SPEC-MOBILE-DENSITY-008

Given 文章数据、字体或视口尺寸导致 section 高度变化
When 页面提交新的布局
Then 客户端通过固定卡片几何或一次性 LayoutSnapshot/ResizeObserver 批量测量，并保持当前视觉锚点，不出现可见抖动

### SPEC-MOBILE-DENSITY-006

Given 推荐或归档页处于 `375x812` 或 `812x375`
When 用户使用底部导航
Then 底栏是唯一主导航且只包含推荐/文章；详情页不显示底栏，系统返回路径可预测

## 视觉契约

- Shelf 使用 `76px` 固定左轨和可收缩右轨；左轨 sticky，右轨按 BFF sections 连续排列。
- Tab 与卡片的触控盒均不小于 `44px`；active 指示线使用预留槽位，不改变几何尺寸。
- 每张卡片预留标题两行、摘要两行和一至两行元数据；无摘要显示低强调占位但保持相同高度。标签最多两项，超出显示 `+N`。
- 加载、空和错误状态复用最终双轨结构的尺寸；筛选提交期间保留旧内容高度，响应到达后批量替换。
- Scrollspy 只更新 active 的颜色/指示线，点击定位使用 `scroll-margin-top`，不修改 URL/history；programmatic scroll 期间暂时锁定 spy 更新。
- 默认固定卡片几何；仅在字体/视口等真实高度变化时使用批量 `ResizeObserver` 快照和锚点补偿，禁止滚动处理器逐项读写布局。

## 边界与失败

- 主要触控目标至少 `44px`，相邻目标至少 `8px`；
- 页面不得出现横向滚动，安全区不得遮挡内容；
- 不依赖 hover、tooltip、右键或手势-only 操作；
- 低动效设置下不播放非必要动画。

## 测试/验收证据

- 自动化门禁：项目既有 Go、TypeScript、lint、格式和构建检查；
- 人工验收：固定 URL、视口、数据准备和截图记录。
