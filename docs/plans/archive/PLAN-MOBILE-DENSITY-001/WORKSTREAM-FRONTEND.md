---
kind: workstream
id: WORKSTREAM-MOBILE-DENSITY-FRONTEND
status: completed
plan_id: PLAN-MOBILE-DENSITY-001
role: frontend-mobile
owner: frontend-mobile
depends_on: [WORKSTREAM-MOBILE-DENSITY-PRODUCT, WORKSTREAM-MOBILE-DENSITY-VISUAL]
write_set: [web/mobile/]
last_reviewed: 2026-09-05
---

# C Mobile 页面实现

## 目标

按移动端页面契约消费 BFF sections，实现页面级 F 型 Shelf、Scrollspy、点击定位和无抖动布局。

## 输入

- `SPEC-*` 场景和页面清单；
- 移动端密度、状态和浮层规范；
- Mobile Shelf BFF 响应契约、领域模型和主题令牌。

## 输出

- C Mobile 页面与导航交互；
- Filter + Shelf 的紧凑结果展示；
- 可复现的移动端验收证据。

## 实施任务

- 先建立结构稳定的页面骨架和加载占位，再接入真实数据；
- 只调用 Mobile Shelf BFF，不在客户端进行推荐/类型/文章数据归一化；
- 按页面级 F 型 Shelf 实现左侧分区导航（推荐、类型）和右侧连续 section；
- 使用 IntersectionObserver 更新 active，点击分区滚动到首卡，不修改 URL 或 history；
- 优先固定卡片几何；必要时使用 TS LayoutSnapshot、ResizeObserver 和滚动锚点补偿；
- 保持 PC 端组件和 DOM/CSS 实现隔离；
- 覆盖长标题、缺失摘要、无结果、接口错误和返回重试；
- 文章库按 sections 直接渲染；首屏至少展示推荐分区和一个类型分区的完整卡片，不因提高密度而缩小正文到不可读或低于触控标准。

## 测试/验收

- 运行现有质量检查；
- 按 `SPEC-*` 执行移动端手工或浏览器验收；
- 验证筛选状态可见、可清除、可恢复，且不会让用户在每个条目中重复操作；
- 检查无横向溢出、无明显布局跳动、返回路径可预测。

## 阻塞

无代码阻塞；等待 PM 固定视口手工视觉验收。

## 交付记录

原有 C Mobile 列表实现不满足页面级分区 Shelf 和 BFF 约束，待后端 BFF 契约稳定后重做。

2026-09-05：已改为消费 BFF `sections[].articles`，实现左侧 sticky 分区 Tab、右侧连续 section、IntersectionObserver scrollspy 和 `scrollIntoView` 定位。Shelf 导航不写 URL/history；筛选继续使用既有 URL 状态恢复。通过 Web 核心测试、类型检查、lint 和生产构建。
