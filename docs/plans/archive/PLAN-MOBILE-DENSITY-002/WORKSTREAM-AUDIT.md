---
kind: workstream
id: WORKSTREAM-MOBILE-DENSITY-AUDIT
status: completed
plan_id: PLAN-MOBILE-DENSITY-002
role: visual-design
owner: visual-design
depends_on: [PLAN-MOBILE-DENSITY-001]
write_set: [docs/plans/archive/PLAN-MOBILE-DENSITY-002/VISUAL-AUDIT.md]
last_reviewed: 2026-09-05
---

# C Mobile 视觉审计与优化路线

## 目标

先建立当前移动端页面和元素的事实基线，再识别信息密度、视觉层级和交互路径问题，输出可排序的优化候选，不直接跳入实现。

## 审计范围

- 推荐首页：Header、标题区、推荐条目、主操作、底部导航、状态反馈；
- 文章库：标题区、Filter 触发器、Filter Panel、Shelf 索引、分区、文章条目、状态反馈；
- 文章详情：阅读 Header、返回、标题区、正文入口、底部返回、状态反馈；
- 真实窄屏和常见手机视口下的留白、溢出、折行、触控和滚动行为。

## 输出

- 页面/元素 inventory；
- 问题证据：截图、视口、复现步骤或代码定位；
- 候选提升方向，按影响、成本、风险和依赖排序；
- 建议保留、删除、合并、折叠或延后的元素；
- 需要拆成 003 或后续计划的候选主题。

当前首轮审计记录见同目录的 `VISUAL-AUDIT.md`，初步将文章详情页列为最高优先级。审计不直接修改架构、Spec 或实现代码。

## 交付记录

2026-09-05：完成三页面盘点，详情页正文进入路径列为优先实现项；推荐页和文章库问题保留为后续候选，不扩大本轮实现范围。用户确认 002 可关闭归档。

## 验收

- 每个当前移动端页面都有盘点记录；
- 每个高优先级问题都有证据，不以“感觉空”作为唯一理由；
- 审计结论不预先绑定某种布局，能支持后续产品取舍。
