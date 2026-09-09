---
kind: evidence
id: EVIDENCE-ADMIN-AUTH-001
plan_id: PLAN-ADMIN-AUTH-001
status: completed
last_reviewed: 2026-09-08
---

# 管理端鉴权实施与验收证据

本记录只保存可复核结果和路径，不包含管理密码、TOTP secret、恢复码或 session token。

## 自动化与进程证据

以下命令均在项目根通过项目 Flake 执行：

| 命令 | 结果 |
| --- | --- |
| `nix develop ./nix -c cargo test --manifest-path src/Cargo.toml -p product --all-targets` | 通过；Product auth core、HTTP 和真实子进程测试均为 0 失败 |
| `nix develop ./nix -c cargo test --manifest-path src/Cargo.toml -p product --lib --test admin_auth_http` | 通过；95 项 lib 测试和 2 项 auth 进程测试通过 |
| `nix develop ./nix -c cargo clippy --manifest-path src/Cargo.toml -p product --all-targets -- -D warnings` | 通过 |
| `nix develop ./nix -c node --experimental-strip-types --test ops/src/application/admin-auth.test.ts` | 通过，4/4 |
| `OPS_RUNTIME_E2E=full nix develop ./nix -c ops quality check` | 通过；13/13 runtime stack、108/108 ops contract、Rust、前端与架构门禁通过 |
| `nix develop ./nix -c ops quality check` | 最终安全整改后复跑通过；Rust、ops、前端、build 与架构门禁均通过 |
| `nix develop ./nix -c ops delivery build` | 通过；生成最终 frontend dist 与 Rust release binaries |
| `git diff --check` | 通过 |

进程测试位于
[`src/backend/product/tests/admin_auth_http.rs`](../../../../src/backend/product/tests/admin_auth_http.rs)，
覆盖凭证缺失 fail closed、真实 TOTP 登录、滑动 cookie、登出撤销、恢复码首次成功与
Product 重启后二次拒绝、Product 重启后旧 session 失效、客户端超长密码限速、无效 PHC
继续返回 unavailable、非可信 peer 与重复转发头不能改变客户端 IP 或 `Secure` 判断，以及
credential helper 在非 TTY 子进程中退出 20 且不创建状态。

auth core 测试另覆盖 Argon2id 策略、TOTP `±1` 全窗口、相邻 counter 碰撞、持久 replay
高水位与允许回拨范围、恢复码锁和原子替换、session 容量、并发登录 reservation、限速状态
容量保护、随机源失败事务语义、文件 owner/mode/symlink 检查和秘密类型的日志脱敏。

## 浏览器证据

- Auth 专属[浏览器报告](./evidence/browser/report.json) 的最终结果为 `passed: true`、
  `errors: []`，14 条检查全部通过；[验收脚本](./evidence/browser-auth-acceptance.mjs)
  只从环境读取临时凭证，报告和截图不保存秘密；
- 报告覆盖受保护页面 302 与安全 `next`、管理 API 401、错误凭证 401、恢复码登录、
  登出后 session 撤销、连续失败 `401 x 4 -> 429`，以及无凭证 Product 的
  `ADMIN_AUTH_UNAVAILABLE` 503；
- [错误凭证](./evidence/browser/desktop-invalid-credentials.png)、
  [认证后工作区](./evidence/browser/desktop-authenticated-workspace.png)、
  [限速](./evidence/browser/desktop-rate-limited.png)和
  [鉴权不可用](./evidence/browser/desktop-auth-unavailable.png)截图均已生成；工作区与登录错误态
  无页面错误和横向溢出；
- Taxonomy 的真实 GitHub[浏览器报告](../PLAN-CONTENT-TAXONOMY-001/evidence/browser/report.json)
  另确认 Desktop/Mobile 公开页面没有管理入口，待发布内容没有泄露到公开端。

## 安全复核

2026-09-08 的收尾复核针对本计划认证写集和已提出的安全问题进行。TOTP 回拨重放、客户端
超长密码错误分类、限速记录容量驱逐、helper TTY 边界、HTTP owned secret 清零、恢复码
跨重启一次性、session 重启失效和可信代理头处理均已整改并有测试；复核后该范围内没有
未关闭 finding。

## 待用户完成

- 实际管理密码、TOTP 配置和一次性恢复码的保管只由用户完成，本证据不代替秘密交接；
- 用户仍需完成 [ACCEPTANCE.md](./ACCEPTANCE.md) 中的产品确认；
- 用户确认前，计划保持 active、Spec 保持 draft，不归档。
