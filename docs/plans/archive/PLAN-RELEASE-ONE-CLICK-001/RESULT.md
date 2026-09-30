# 计划结果

## 计划

- Plan ID：`PLAN-RELEASE-ONE-CLICK-001`
- 最终状态：`completed`
- 项目经理：`project-manager`

## 实际交付

- 新增统一入口 `ops release script|build|both`。
- 发布前检查 `main` 分支、干净工作树、当前提交、origin、本地 tag 和远程 tag 冲突。
- 按 Script/Build 各自的最高版本自动递增 patch；双发布使用同一提交但不强制同版本号。
- 默认只预检，`--yes` 才创建并推送 tag；推送后输出 GitHub Actions 检查地址，不自动更新服务器。
- CI 增加 installer `--help` 和 Build 发布包 `MANIFEST.json`/`SHA256SUMS` 基础检查。
- 运维指南补充发布命令、确认步骤、失败边界和服务器独立 redeploy 说明。

## 已验证内容

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| 发布命令和参数注册 | `ops release --help`；CLI 帮助、退出码和命令注册测试 | passed |
| 自动版本和双发布 | `apps/blog/test/commands/release.test.ts`；Script/Build 独立递增、同提交 | passed |
| 本地非生产演练 | 临时 bare remote 执行 `both --yes`，推送 `script-v0.1.0` 与 `build-v0.1.0`；两个 tag 指向同一 SHA；第二次 dry-run 生成 `v0.1.1` | passed |
| 类型和文档格式 | `pnpm typecheck`、相关 `node --test`、`git diff --check` | passed |
| 用户验收 | 用户确认演练结果并要求归档 | accepted |

## 未执行的外部验证

- 未在真实 GitHub 仓库执行非生产 tag/Release 演练，因此未验证远程 Release 存在、资产下载、checksum 和 installer 下载链路。
- `workflow_dispatch` 仍只构建 workflow artifact，未形成手动触发并发布 Release 的完整闭环。
- 未执行真实生产发布、GitHub 权限验证和服务器 `redeploy`。

## 停止原因与恢复条件

本阶段目标是交付可控的本地一键发布入口，用户已完成验收并确认结果可接受。真实 GitHub 发布、生产发布和服务器 `redeploy` 未执行，保留为后续独立运维验证，不影响本计划完成。

恢复时应先补充测试仓库或非生产 GitHub Release 演练，再决定是否改进 `workflow_dispatch` 和远程资产轮询，最后单独安排生产服务器验收。
