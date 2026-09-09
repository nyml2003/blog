---
kind: spec
id: SPEC-ADMIN-AUTH-001
status: accepted
owner: backend
plan_id: PLAN-ADMIN-AUTH-001
last_reviewed: 2026-09-10
---

# 管理端鉴权（Session + TOTP）与管理台导航修复

## 目标

为 Desktop 管理端建立应用层鉴权：登录页 + 服务端 session cookie 中间件 + TOTP 二步验证 + 登录限速；未登录访问管理页面重定向登录页、调用管理 API 返回 401。管理台 Header 增加"返回站点"入口。公开端零影响。

## 非目标

- 不做 TLS / 域名 / systemd unit 模板（归后续公网部署计划）；本计划只交付应用层鉴权，明文链路下的窃听风险见"边界与失败"；
- 不做 WebAuthn / Passkey（未来扩展方向，本期不承诺、不预建抽象）；
- 不做多用户 / 角色体系（单人管理端，无用户表）；
- 不动公开 API、Mobile 端、文章数据模型；
- 不做防火墙 / IP 白名单交付（运维手段，仅在文档中给出中间期建议）。

## 契约

- **凭证来源（单人，无用户表）**：argon2id 密码哈希与 TOTP secret 经环境变量注入（`BLOG_ADMIN_PASSWORD_HASH`、`BLOG_ADMIN_TOTP_SECRET`，由 systemd / ops 运行环境提供）；恢复码首次生成时输出一次（10 张，单张一次性，哈希留存于运行时数据目录）。生成与恢复 helper 只允许在 stdin、stdout、stderr 都连接 TTY 时运行，在读取秘密或创建状态前拒绝管道与重定向。凭证缺失时管理端整体拒绝服务（fail closed），公开端不受影响。
- **登录流程**：`POST /api/admin/session`（密码 + TOTP 6 位码或恢复码）→ 签发 session；`DELETE` 登出并撤销。密码与 TOTP 校验均常数时间比较；TOTP 允许 ±1 时间窗，重放高水位与完整回拨候选范围持久保存，Product 重启后已用码仍作废。超过输入上限的客户端密码按无效凭证计入限速；存储 PHC 或校验 adapter 错误仍 fail closed。
- **Session cookie**：opaque token + 服务端会话表（内存即可，重启即登出——可接受并写入文档）；`HttpOnly` + `SameSite=Strict`，`Secure` 仅在 socket peer 命中精确可信代理集合且单值转发头确认 HTTPS 时置位；伪造、重复或无效转发头回退到直连来源。默认 12 小时滑动过期。CSRF 由 `SameSite=Strict` + 同源 API 覆盖，不另发 token。
- **中间件行为**：`/admin/*` 页面未登录 → `302 /admin/login.html?next=<原路径>`；`/api/admin/*` 未登录 → `401`；`/api/admin/session` 登录 / 登出端点与登录页开放。管理端静态资源（JS/CSS）不设防（页面壳无敏感数据，数据全在 API）。
- **限速**：登录失败按 IP 计数，5 次 / 15 分钟冷却，冷却期内拒绝尝试；成功登录清零。
- **导航**：admin Header 增加"返回站点"链接（`/`）；用户端不出现任何管理入口（现状保持）。
- **前端 401 处理**：Desktop 管理页收到 401 统一跳转登录页（带 `next`）。
- **Dev / Mock**：Mock 场景默认无鉴权直通（显式场景开关声明，不悄悄放行）；Rust Product 本地开发用 ops 生成的真实凭证走真实流程。
- **日志**：登录成功 / 失败、限速触发记结构化日志；不落密码、TOTP 码、恢复码明文、session token。

## 场景

### SPEC-ADMIN-AUTH-001-001

Given 未登录会话

When 访问任一 `/admin/*` 页面

Then `302` 至 `/admin/login.html?next=<原路径>`，登录成功后回到 `next`

When 调用任一 `/api/admin/*`（除 session 端点）

Then `401`，响应不含管理数据

### SPEC-ADMIN-AUTH-001-002

Given 正确密码与有效 TOTP 码

When `POST /api/admin/session`

Then 签发 session cookie（`HttpOnly` / `SameSite=Strict` / HTTPS 下 `Secure`），后续管理页面与 API 正常访问

### SPEC-ADMIN-AUTH-001-003

Given 错误密码或错误 TOTP 码

When 连续失败 5 次

Then 第 5 次起进入 15 分钟冷却，期内正确凭证也被拒绝并提示冷却

### SPEC-ADMIN-AUTH-001-004

Given TOTP 设备不可用

When 使用有效恢复码登录

Then 登录成功且该恢复码立即作废，二次使用被拒绝

### SPEC-ADMIN-AUTH-001-005

When `DELETE /api/admin/session`

Then session 撤销，cookie 失效，再访管理端回到场景 001

### SPEC-ADMIN-AUTH-001-006

Given 任一管理页已登录

Then Header 出现"返回站点"链接指向 `/`，用户端页面与 `/api/public/*` 行为零变化

### SPEC-ADMIN-AUTH-001-007

Given 环境变量缺少任一凭证

Then 管理页面与 API 一律拒绝（fail closed），公开端与 Mobile 正常服务

### SPEC-ADMIN-AUTH-001-008

Given Mock dev 场景

Then 直通无鉴权（显式开关），生产 / integration 场景鉴权全量生效

## 边界与失败

- **明文链路**：TLS 落地前，session cookie 与登录凭证可被链路窃听——本计划交付的防护边界是"未授权访问"，不含链路机密性；公网部署计划必须先于 / 同时落地 TLS，中间期建议防火墙限源（运维文档建议，非本计划交付）；
- 内存 session 表重启登出，属可接受行为并写入用户文档；
- 恢复码遗失且 TOTP 设备遗失 = 锁死，需服务器本地重新生成（ops 工具），文档明示；
- 时钟偏移：TOTP ±1 窗口容忍；服务器 NTP 由部署层保证。

## 测试/验收证据

- 实现与自动化测试已完成：覆盖中间件 302/401、登录成功与失败、限速与冷却、
  TOTP 完整窗口和跨重启重放、恢复码原子一次性、session 重启失效、登出撤销、
  fail closed、可信代理与 cookie 标志、TTY 边界和日志脱敏；
- 真实浏览器证据已完成：恢复码登录、安全 `next`、认证后工作区、公开端隔离、页面错误
  和横向溢出检查均通过；
- 命令结果、进程测试、安全复核和浏览器证据路径见
  [PLAN-ADMIN-AUTH-001/EVIDENCE.md](../plans/archive/PLAN-ADMIN-AUTH-001/EVIDENCE.md)；
- Spec 保持 draft，等待用户完成秘密保管与产品验收后再推进为 accepted。
