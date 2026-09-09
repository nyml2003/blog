---
kind: acceptance
id: ACCEPTANCE-FRONTEND-PAGE-TEMPLATE-001
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
status: pending
owner: user
last_reviewed: 2026-09-08
---

# 页面模板与 T/F 货架验收清单

代码、自动化测试和浏览器证据已完成，以下项目由用户确认后才允许把 plan/spec 推进为完成并归档。

## 已交付证据

- 注册表覆盖 17 个页面和 22 条 alias；HTML、Vite 输入和 Product 静态路由均由注册表派生；
- 前端源码没有手写 HTML，页面入口统一使用 `definePage`，Mobile CSS 统一为单一入口；
- `test:core` 107/107、Native/WASM parity 287、typecheck、lint、format:check、build 和
  `ops quality check` 全部通过；
- [浏览器报告](./evidence/browser-report.json) 于 2026-09-08 06:56（Asia/Shanghai）基于
  当前源码重建 integration 后 52/52 通过，运行时页面错误为 0；增强脚本连续两次完整
  通过，仓库报告与截图取第二次结果，并替换此前 28 项旧报告；
- Mobile `/m/articles/index.html` 与 `/m/articles/list.html` 保持 F 型；其他公开货架使用 T 型；
- T 型首次请求同时取得 filters 和首个 filter 的文章，切换 filter 会重新请求并重新渲染；
- 两个 F 型入口均验证一级/二级分类切换、父级汇总去重、loading 时 tabs 与焦点稳定，
  以及分类 Back 的 URL、选择与滚动恢复；index 入口还验证详情返回恢复。

## 用户确认

- [ ] 抽查公开端和管理端 title、charset、viewport、theme-color 与首绘表现；
- [ ] 抽查 Desktop 首页、Desktop 文章列表和 Mobile 首页的 T 型筛选切换；
- [ ] 抽查 Mobile 两个 F 型入口的一级/二级分类切换、父级汇总、分类 Back 和详情返回；
- [ ] 确认桌面与手机页面没有视觉重叠、横向溢出或明显交互回归；
- [ ] 确认无需新增页面、title 或货架范围调整。

用户确认后，PM 需将本记录改为 `status: completed`，补写 RESULT，推进 SPEC 为 `accepted`，再移动到 `docs/plans/archive/`。
