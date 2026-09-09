---
kind: plan
id: PLAN-ADMIN-AUTH-001
status: archived
owner: project-manager
created: 2026-09-08
last_reviewed: 2026-09-10
---

# 管理端鉴权与登录闭环

## 目标

按 [SPEC-ADMIN-AUTH-001](../../../specs/SPEC-ADMIN-AUTH-001.md) 为 Desktop 管理端建立单人 Session + TOTP 鉴权，统一保护管理页面和管理 API，并补齐登录、登出、恢复码、限速、凭证缺失 fail-closed、管理端返回站点入口与前端 401 跳转。公开端和 Mobile 公共页面行为保持不变。

## 成功标准

1. 未登录访问 `/admin/*` 重定向到带安全 `next` 的登录页，管理 API 返回 401；
2. 密码 + TOTP 或一次性恢复码可以签发服务端 session，cookie 标志、滑动过期、登出撤销和重启登出符合 Spec；
3. 登录失败限速、TOTP 时间窗与重放防护、恢复码一次性和日志脱敏都有自动化测试；
4. Desktop 登录页、管理页面统一 401 跳转和“返回站点”入口可在真实 Product 同源模式验收；
5. Mock dev 的免鉴权是显式模式，Product/integration 缺凭证时管理能力 fail-closed；
6. Rust、前端、ops、质量门禁和浏览器场景全绿，交付恢复码与部署配置说明。

## 非目标

- 不实现 TLS、域名、systemd unit、防火墙、WebAuthn、多用户或角色体系；
- 不改变公开 API、文章领域模型、Mobile 公共端或 taxonomy 业务语义；
- 不把 Mock 免鉴权扩散到 Product/integration。

## 约束与依据

- Spec：[SPEC-ADMIN-AUTH-001](../../../specs/SPEC-ADMIN-AUTH-001.md)；
- 依赖：`PLAN-CONTENT-TAXONOMY-001` 的 Product `ContentService` 接线完成后，后端鉴权 middleware 才能串行修改 `main.rs` / `http.rs`；
- 凭证只由环境或 ops 显式生成/注入，不进入前端、日志、fixture 或仓库；
- 管理 `next` 只接受同源 `/admin/` 路径，拒绝开放重定向；
- 本计划不修改 `docs/FACTS.md`。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 登录 UI 与 401 处理 | frontend-desktop | Spec | `src/frontend/pages.registry.ts`, `src/frontend/common/client/`, `src/frontend/solid/queries/`, `src/frontend/desktop/src/`, 前端测试与样式 | completed |
| Session / TOTP / middleware | backend-product | taxonomy ContentService 交接 | `src/backend/product/`, `src/core/protocol/`, Product 测试 | completed |
| 凭证与恢复码入口 | infra | backend auth API 稳定 | `ops/`, `docs/guides/operations.md`, ops 测试 | completed |
| 集成与验收 | project-manager | 全部工作流 | 本计划目录、Spec 证据、浏览器 evidence | completed |

## 验收顺序

1. 前端登录页面、401 跳转和导航先行，不启用后端保护；
2. taxonomy Product 后端写集交接后接 session/TOTP/middleware；
3. ops 提供显式凭证/恢复码生成与 integration 注入；
4. 运行 Rust/前端/ops 全门禁和未登录、登录、限速、恢复码、登出、fail-closed 浏览器检查；
5. 由用户完成最终产品验收后归档。

实现、自动化和浏览器证据见 [EVIDENCE.md](./EVIDENCE.md)，用户确认项见
[ACCEPTANCE.md](./ACCEPTANCE.md)。

## 未决项

- 实现范围内没有未关闭的工程问题；计划保持 active，等待用户完成实际凭证与恢复码
  保管确认、产品走查和最终验收后再归档。
