---
kind: acceptance
id: ACCEPTANCE-FRONTEND-PAGE-TEMPLATE-001
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
status: pending
owner: user
last_reviewed: 2026-09-07
---

# 页面模板与 T/F 货架验收清单

代码、自动化测试和浏览器证据已完成，以下项目由用户确认后才允许把 plan/spec 推进为完成并归档。

## 已交付证据

- 注册表覆盖 16 个页面和 20 条 alias；HTML、Vite 输入和 Product 静态路由均由注册表派生；
- 前端源码没有手写 HTML，页面入口统一使用 `definePage`，Mobile CSS 统一为单一入口；
- `test:core` 76/76、typecheck、lint、format:check、build 和 `ops quality check` 全部通过；
- [浏览器报告](./evidence/browser-report.json) 28/28 通过，运行时页面错误为 0；截图和可重跑脚本位于同目录；
- Mobile `/m/articles/index.html` 与 `/m/articles/list.html` 保持 F 型；其他公开货架使用 T 型；
- T 型首次请求同时取得 filters 和首个 filter 的文章，切换 filter 会重新请求并重新渲染；
- F 型分区定位、详情返回位置恢复、加载更多、三级筛选和空态均已验证。

## 用户确认

- [ ] 抽查公开端和管理端 title、charset、viewport、theme-color 与首绘表现；
- [ ] 抽查 Desktop 首页、Desktop 文章列表和 Mobile 首页的 T 型筛选切换；
- [ ] 抽查 Mobile 两个 F 型入口的分区/筛选、加载更多、详情返回和空态；
- [ ] 确认桌面与手机页面没有视觉重叠、横向溢出或明显交互回归；
- [ ] 确认无需新增页面、title 或货架范围调整。

用户确认后，PM 需将本记录改为 `status: completed`，补写 RESULT，推进 SPEC 为 `accepted`，再移动到 `docs/plans/archive/`。
