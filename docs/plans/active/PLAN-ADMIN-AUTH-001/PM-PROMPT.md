---
kind: plan-pm-prompt
id: PM-PROMPT-ADMIN-AUTH-001
plan_id: PLAN-ADMIN-AUTH-001
status: ready
last_reviewed: 2026-09-08
---

# 项目经理 Agent 启动提示

执行前阅读项目 `AGENTS.md`、`SPEC-ADMIN-AUTH-001`、本计划、前端 TypeScript 指南、当前 Product/Mock/ops 架构和 active plan write set。

保持单人管理端、服务端 opaque session、密码 + TOTP/恢复码、5 次/15 分钟限速、12 小时滑动过期、`SameSite=Strict`、HTTPS 下 `Secure`、缺凭证 fail-closed、Mock 显式免鉴权等用户已定契约。禁止记录密码、TOTP、恢复码或 session token，禁止开放重定向，禁止让前端承担鉴权权威。

前端和后端可按计划写集分开；`main.rs` / `http.rs` 必须等待 taxonomy ContentService 后端交接。自动化和浏览器证据完成后进入 acceptance，不由 agent 代替用户勾选产品验收。
