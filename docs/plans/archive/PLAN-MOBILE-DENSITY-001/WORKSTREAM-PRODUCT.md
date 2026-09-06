---
kind: workstream
id: WORKSTREAM-MOBILE-DENSITY-PRODUCT
status: completed
plan_id: PLAN-MOBILE-DENSITY-001
role: product
owner: product
depends_on: []
write_set: [docs/specs/, docs/plans/active/PLAN-MOBILE-DENSITY-001/PLAN.md]
last_reviewed: 2026-09-05
---

# 信息层级与验收口径

## 目标

把“信息密度不够”转成页面级、可观察、可验收的产品要求。

## 输入

- 当前 C Mobile 页面和已有 API 数据；
- `ARCH-UIUX` 的移动端隔离与交互约束；
- 用户当前对推荐、Filter、Shelf、文章详情的 MVP 决策。

## 输出

- C Mobile 页面清单及页面之间的进入/返回关系；
- 每个页面的信息优先级和首屏必须出现的字段；
- `SPEC-*` 场景：推荐、归档、筛选、详情、加载、空结果、错误和未保存离开。

## 实施任务

- 记录当前页面的空白来源和重复信息；
- 明确标题、摘要、标签、类型、创建时间、更新时间的展示优先级；
- 定义 F 型 Shelf 的扫描顺序：顶部筛选状态 -> 左侧锚点 -> 文章标题/摘要 -> 次级元数据；
- 明确筛选入口只出现一次，筛选条件以可移除的状态条或紧凑触控入口呈现；
- 为长标题、无摘要、无标签、筛选无结果定义降级规则；
- 设定至少一个窄屏和一个常见手机视口作为验收基准。

## 测试/验收

- 每个核心页面至少一个正常场景和一个边界场景；
- 场景能通过手工步骤或浏览器测试复现，不用主观描述作为唯一标准。

## 阻塞

产品页面盘点和验收口径已完成，详见 `SPEC-MOBILE-DENSITY-001.md` 与 `SPEC-ARTICLE-SUMMARY-001.md`。

## 交付记录

已交付 Spec；视口、首屏条数、类型锚点、摘要规则和底栏范围均已确认。
