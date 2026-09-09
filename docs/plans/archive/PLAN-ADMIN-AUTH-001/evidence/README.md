# 管理端鉴权浏览器证据

- [browser/report.json](./browser/report.json)：14 条浏览器断言全部通过，`errors` 为空；
- [browser/desktop-invalid-credentials.png](./browser/desktop-invalid-credentials.png)：错误凭证 401 与页面错误提示；
- [browser/desktop-authenticated-workspace.png](./browser/desktop-authenticated-workspace.png)：恢复码登录后的受保护工作区；
- [browser/desktop-rate-limited.png](./browser/desktop-rate-limited.png)：连续失败后的 429 错误提示；
- [browser/desktop-auth-unavailable.png](./browser/desktop-auth-unavailable.png)：未配置凭证时的 503 fail-closed 提示；
- [browser-auth-acceptance.mjs](./browser-auth-acceptance.mjs)：生成报告与截图的 CDP 验收脚本。

脚本需要一套隔离的临时鉴权状态和一套明确未注入凭证的 Product。密码与未使用恢复码仅通过
进程环境传入，报告和截图不记录其值。该证据证明浏览器行为与状态码，不代替用户保管实际
生产密码、TOTP secret 和恢复码。
