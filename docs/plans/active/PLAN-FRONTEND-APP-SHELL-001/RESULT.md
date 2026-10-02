---
kind: plan-result
plan: PLAN-FRONTEND-APP-SHELL-001
status: completed
completed: 2026-10-01
---

# App Shell 计划结果

本计划按已确认范围完成：交付 `@fluvient-loom/app-shell`，并将能力接入移动端文章详情页。应用接入保持为静态、低对比度、无默认 shimmer 的首帧 shell；首页、文章库、检索页、Desktop 与 admin 未纳入本次推广。

## 证据

| 范围 | 结果 |
| --- | --- |
| 包验证 | 类型检查、4 项单元测试、smoke、`npm pack --dry-run --json` 通过 |
| 工作区门禁 | `CI=true ops quality check` 通过 |
| 浏览器集成 | `CI=true ops e2e --mode integration` 通过；包含禁 JS shell、正常删壳、layout-shift、375/430 宽度及主题/字体组合；产物 `target/e2e/1790866310044-4354` |
| 错误态 | `server-error` 和 `malformed-response` 均通过删壳及错误提示断言；产物 `target/e2e/1790866474487-4578`、`target/e2e/1790866474487-4579` |
| 性能 | `CI=true ops perf mobile --mode integration --runs 3` 通过；390px nav-switch 与缓存命中证据保留在 `target/e2e/1790863506185-97046` |
| 运行时 | `CI=true ops runtime dev --scenario default --web-port 5173 --mock-port 9090 --json` 报告 `SERVICES_READY`，随后正常停止 |

## 未交付与恢复条件

列表类页面、Desktop/admin 页面和详情重取时的 `latest` 保留体验仍停放。恢复推广前需重新确认范围，并为列表重取场景补充旧内容顶住、视觉和性能验收。
