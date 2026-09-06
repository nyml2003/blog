---
kind: workstream
id: WORKSTREAM-ARTICLE-HTML-VALIDATION-TESTING
status: in_progress
plan_id: PLAN-ARTICLE-HTML-VALIDATION-001
role: backend-frontend-admin
owner: backend-frontend-admin
depends_on: [WORKSTREAM-ARTICLE-HTML-VALIDATION-PARSER, WORKSTREAM-ARTICLE-HTML-VALIDATION-ADMIN]
write_set: [web/common/**/*.test.ts, web/desktop/**/*.test.*, internal/**/*_test.go, docs/plans/active/PLAN-ARTICLE-HTML-VALIDATION-001/]
last_reviewed: 2026-09-06
---

# HTML Profile 回归与渲染验收

## 目标

用同一套 Profile fixture 验证领域校验、HTTP 行为、B Desktop 作者反馈和 C 端真实渲染，防止允许集合、诊断和渲染能力分别漂移。

## 输入

- 已确认 Spec；
- Rust core/WASM 校验实现与 B Desktop 接入；Rust Product HTTP 结果在 `PLAN-OPS-RUNTIME-DEV-001` backend workstream 可用后补充；
- C Desktop/C Mobile 系统主题和浏览器验收能力。

## 输出

- 正反 fixture 集与 Profile version；
- WASM/前端协议结果；Rust backend 单元/HTTP 结果（外部 workstream 提供后）；
- B Desktop 行为测试；
- C Desktop/C Mobile 的阅读渲染验收记录；
- 无法在当前环境完成的浏览器证据缺口。

## 实施任务

1. 覆盖允许结构和常见攻击/误用结构。
2. 检查诊断稳定性、定位、草稿/发布门槛和输入保留。
3. 验证合法正文的桌面与移动阅读质量，包括代码、表格与链接；验证图片在进入预览或发布前被拒绝。
4. 记录 Profile 变更所需的最小 fixture 更新方式。

## 测试/验收

- 不把“校验器返回错误”误判为浏览器渲染安全；
- 不把 B 端局部提示误判为服务端边界已闭合；
- 以公开详情页和 B 端预览的真实路径完成最终验收。

## 阻塞

- 浏览器验收基础设施缺失时，记录为证据限制并移交给 `PLAN-BROWSER-ACCEPTANCE-001`，不得伪造截图验收。

## 交付记录

- 2026-09-06：新增 `web/common/validation/article-html.ts` 共享 inspection schema 和 3 组边界测试；`pnpm test:core`、typecheck、lint、format:check、build 与 `ops quality check` 全部通过。
- 2026-09-06：机器可读 v1 fixture 已建立于 `fixtures/article-html-v1.json`；Rust core 与真实浏览器路径验收等待 workspace 和 Product/B Desktop 接入。
