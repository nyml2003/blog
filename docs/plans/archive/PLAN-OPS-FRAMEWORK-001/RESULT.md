# 计划结果

## 计划

- Plan ID：`PLAN-OPS-FRAMEWORK-001`
- 最终状态：`partial`
- 项目经理：project-manager

## 结果

- `packages/cli-kit/`、`packages/cli-core/`、`packages/cli-plugins/`、`apps/blog/`、`apps/blog-deploy/` 已完成物理分层。
- 旧 `ops/` 目录已删除；主 CLI 和 installer 分别由两个 app 入口提供。
- 测试迁移到独立的 `apps/blog/test/` 与 `apps/blog-deploy/test/`，质量检查覆盖新的 app 源码和测试。
- 安装器复用统一参数框架，必须显式指定 `init`、`deploy` 或 `redeploy`；`buildTag` 保留在 `blog.json`，当前只允许 `latest`。
- Release 选择使用严格的 `build-vA.B.C` 稳定版本解析与最高版本排序。

## 已验证内容

| Spec/验收项 | 证据 | 结果 |
| --- | --- | --- |
| 框架、命令、入口分层 | `@fluvient-cli/*` workspace 包、`apps/blog`、`apps/blog-deploy` 测试和质量边界检查通过 | passed |
| 全量 ops 回归 | `pnpm --filter @blog/blog test`：85 passed、13 skipped、0 failed；`pnpm --filter @blog/blog-deploy test`：7 passed、0 skipped、0 failed | passed |
| 质量门禁 | `pnpm typecheck`、`git diff --check`、CLI help/version 冒烟及 installer esbuild bundle 检查通过 | passed |
| installer bundle | esbuild bundle、`--help`、`init`/参数错误冒烟及裁剪符号检查通过 | passed |

## 生效变化

- Facts：无；
- Architecture：ops 内部目录边界已按本计划落地；
- Specs：参数与运行时说明已同步入口、测试目录和 `buildTag` 约束。

## 未决项与后续计划

- `script-release` 已通过：tag `script-v0.1.3`，Release 已上传 `blog-deploy.mjs`；`build-release` 未执行，因为本次变更只涉及 CLI/installer。
- 尚未在真实服务器执行 `node /etc/blog/blog-deploy.mjs redeploy`；需要发布产物和服务器环境后再验收。
