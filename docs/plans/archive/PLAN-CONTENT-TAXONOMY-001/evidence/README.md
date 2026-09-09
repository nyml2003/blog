# 内容分类树验收证据目录

## 可复核产物

- [browser/report.json](./browser/report.json)：17 条浏览器断言全部通过，`errors` 为空；
- [browser/desktop-admin-login.png](./browser/desktop-admin-login.png)：Desktop 管理端登录页；
- [browser/desktop-content-workspace.png](./browser/desktop-content-workspace.png)：Desktop 内容工作区与 active PR #2；
- [browser/desktop-public-articles.png](./browser/desktop-public-articles.png)：Desktop 公开文章只显示已合入内容；
- [browser/mobile-public-home.png](./browser/mobile-public-home.png)：Mobile 公开文章页面只显示已合入内容；
- [browser-acceptance.mjs](./browser-acceptance.mjs)：生成报告和截图的浏览器断言脚本；
- [github-workflow-e2e.mjs](./github-workflow-e2e.mjs)：真实 PR、merge 后同步、公开隔离和下一批恢复驱动；
- [taxonomy-model-e2e.mjs](./taxonomy-model-e2e.mjs)：确定性的模型生成与一次复核证据命令。

## 证据边界

报告与截图不包含运行凭证。真实 GitHub 仓库、PR、commit、工作区版本、公开内容隔离和
运行环境说明统一记录在上级 [EVIDENCE.md](../EVIDENCE.md)。浏览器证据证明脚本断言和
捕获时页面状态，不替代用户对 PR diff、视觉表现和最终产品范围的确认。
