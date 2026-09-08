---
kind: acceptance
id: ACCEPTANCE-ADMIN-AUTH-001
plan_id: PLAN-ADMIN-AUTH-001
status: pending
owner: user
last_reviewed: 2026-09-08
---

# 管理端鉴权验收清单

实现、自动化测试和可复核浏览器证据已完成，详细记录见 [EVIDENCE.md](./EVIDENCE.md)。
以下用户确认项完成前，计划保持 active 且 Spec 不推进为 accepted。

## 自动化与浏览器证据

- [x] Rust session/TOTP/恢复码/限速/cookie/fail-closed/日志脱敏测试通过；
- [x] 前端登录、401 跳转、`next` 校验、返回站点和管理页面回归通过；
- [x] Mock 显式免鉴权、Product/integration 真实鉴权与公开端零回归通过；
- [x] `ops quality check`、`ops delivery build` 和同源浏览器验收通过。

## 用户确认

- [ ] 确认实际管理密码和 TOTP 配置由用户自行安全保管，未写入仓库或验收材料；
- [ ] 确认一次性恢复码已保存到独立安全位置，并理解遗失后的重新生成流程；
- [ ] 确认登录、失败提示、登出与返回站点流程符合预期；
- [ ] 确认恢复码和部署配置说明可操作；
- [ ] 确认公开端和 Mobile 没有鉴权回归。

用户确认后，PM 补写 RESULT、推进 Spec 为 accepted，并移动到 archive。
