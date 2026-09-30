# 计划

Plan 面向一个跨职能、可验收的产品结果，不面向单个文件或单个技术动作。

## 目录

- `active/`：当前执行中的计划；
- `archive/`：已完成或按用户要求结束的计划及结果、证据；
- `_template/`：新计划模板（2026-09-27 自 git 历史恢复）。

当前 active：

- [PLAN-UI-ICON-CONTROLS-001](./active/PLAN-UI-ICON-CONTROLS-001/PLAN.md)：图标与控件文案整理——先确定图标来源与减字边界，再从公开 Mobile 控件试点。2026-09-28 立项，状态 ready。
- [PLAN-RELEASE-ONE-CLICK-001](./active/PLAN-RELEASE-ONE-CLICK-001/PLAN.md)：一键发布 Build 与 Script——围绕现有 `build-v*`/`script-v*` workflow 增加预检、tag 发布和资产验收，确认是否只需打 tag。2026-09-29 立项，状态 ready。
- [PLAN-CONTAINER-DEPLOYMENT-001](./active/PLAN-CONTAINER-DEPLOYMENT-001/PLAN.md)：低资源单机容器部署——结合现有 Product/Data、SQLite、nginx、systemd 和 Release，设计 2 核 2 GB 服务器上的可靠容器运行、备份、升级与回滚方案。2026-09-29 立项，状态 ready。
- [PLAN-OPS-OUTPUT-STANDARD-001](./active/PLAN-OPS-OUTPUT-STANDARD-001/PLAN.md)：ops 输出标准化——统一人类输出、stdout/stderr、JSON/NDJSON 事件、错误码、诊断和敏感信息脱敏。2026-09-29 立项，状态 ready。
- [PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001](./active/PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001/PLAN.md)：Frontend 新基线与旧架构清理——为 Desktop/Mobile 统一页面生命周期和依赖装配，迁移全部旧页面链路后删除 `solid`、旧 Mobile 页面和无消费者的旧 UI 层。2026-09-30 立项，状态 ready。
- [PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001](./active/PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001/PLAN.md)：部署预检与产物下载可观测性——在部署下载前检查网络可达性，统一阶段提示、进度、重试、错误诊断和机器输出。2026-09-30 立项，状态 ready。
- [PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001](./active/PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001/PLAN.md)：Mobile 体验优化——先做完整用户旅程审计，再由接手 agent 与产品确认本轮问题、目标和验收范围。2026-09-30 立项，状态 discovery。

已归档：

- [PLAN-OPS-FRAMEWORK-001](./archive/PLAN-OPS-FRAMEWORK-001/PLAN.md)：ops 框架解耦与 installer 插件化。2026-09-27 立项，2026-09-29 以 `partial` 收尾；本地实现、测试和 bundle 验证完成，CI 发布与真实服务器验收未执行。
- [PLAN-FRONTEND-PAGE-COMPOSITION-001](./archive/PLAN-FRONTEND-PAGE-COMPOSITION-001/PLAN.md)：详情页职责边界与新 Mobile 文章详情试点。2026-09-28 立项，2026-09-29 以 `partial` 收尾。
- [PLAN-FRONTEND-E2E-001](./archive/PLAN-FRONTEND-E2E-001/PLAN.md)：前端浏览器端到端测试——建立由 `ops` 管理的 TypeScript runner。2026-09-29 立项，2026-09-30 以 `partial` 收尾；真实公开端和 Mock 管理端旅程已验证，真实 Product 管理凭证、CI、连续运行和 trace/video 策略留待后续专项。
- [PLAN-FRONTEND-MOBILE-ROLLOUT-001](./archive/PLAN-FRONTEND-MOBILE-ROLLOUT-001/PLAN.md)：新 Mobile 页面逻辑全面收敛。2026-09-29 立项，2026-09-29 以 `completed` 收尾。
- [PLAN-BLOG-DEPLOY-SELF-UPDATE-001](./archive/PLAN-BLOG-DEPLOY-SELF-UPDATE-001/PLAN.md)：`blog-deploy` 自更新——从稳定 `script-v*` Release 校验并原子替换安装器，失败可回退，不自动重启业务服务。2026-09-29 立项，2026-09-30 以 `completed` 收尾；本地、CI、隔离目录和服务器验收完成。
