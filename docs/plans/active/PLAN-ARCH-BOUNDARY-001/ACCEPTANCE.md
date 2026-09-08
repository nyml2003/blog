---
kind: acceptance
id: ACCEPTANCE-ARCH-BOUNDARY-001
plan_id: PLAN-ARCH-BOUNDARY-001
status: pending
owner: user
last_reviewed: 2026-09-08
---

# 架构边界治理验收清单

代码与自动化证据已完成，以下项目由用户确认后才允许把 plan/spec 推进为完成并归档。

## 已交付证据

- `ops quality check` 全绿，包含 Rust fmt/clippy/test、前端 typecheck/lint/format/core/build、ops 契约和架构扫描；
- 页面直接访问 client/data 机制的静态扫描为零违规；
- Product HTTP、Product BFF、protocol、Data store/domain 与 Data Cargo manifest 的边界
  门禁和正负例已覆盖；门禁会拒绝 HTTP 直接过滤分类/文章 snapshot、后代计算，以及
  Data 引入 HTML parser 或外部 HTTP/GitHub client；
- 38 条 API golden 同时由 TS client 路由表、protocol 生产注册表和真实 Product binary 分发测试覆盖；
- [API 响应对照](./API-RESPONSE-DIFF.md) 中 12 个既有读取场景与 `94c5de9` 基线一致；
- [页面浏览器证据](../PLAN-FRONTEND-PAGE-TEMPLATE-001/evidence/README.md) 中的 T/F
  交互回归于 2026-09-08 06:56（Asia/Shanghai）基于当前源码重建 integration；增强后的
  52 项脚本连续通过两次，页面错误 0。

## 用户确认

- [ ] 同意架构迁移部分的公开契约和既有行为保持不变；
- [ ] 同意 T 型货架属于页面计划的已授权功能范围，不纳入架构零变化对照；
- [ ] 抽查 `http.rs`、Product `bff/`、protocol 和 Data store/domain 的职责边界；
- [ ] 确认没有需要另立计划的边界或行为问题。

用户确认后，PM 需将本记录改为 `status: completed`，补写 RESULT，推进 SPEC 为 `accepted`，再移动到 `docs/plans/archive/`。
