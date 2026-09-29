# 计划

Plan 面向一个跨职能、可验收的产品结果，不面向单个文件或单个技术动作。

## 目录

- `active/`：当前执行中的计划；
- `archive/`：已完成或按用户要求结束的计划及结果、证据（当前为空）；
- `_template/`：新计划模板（2026-09-27 自 git 历史恢复）。

当前 active：

- [PLAN-OPS-FRAMEWORK-001](./active/PLAN-OPS-FRAMEWORK-001/PLAN.md)：ops 框架解耦——框架层（参数/路由/帮助/退出码/runner）、命令层、组合层物理分层；服务器安装器复用框架参数与帮助；支持按命令集组合 bundle。2026-09-27 立项，状态 partial（本地实现与门禁完成，CI 发布和服务器验收待真实环境）。
- [PLAN-FRONTEND-PAGE-COMPOSITION-001](./active/PLAN-FRONTEND-PAGE-COMPOSITION-001/PLAN.md)：页面通用逻辑收敛与组装编排——先明确入口、页面级逻辑、页面和组件的职责，再用新 Mobile 文章详情页试点。2026-09-28 立项，状态 ready。
- [PLAN-UI-ICON-CONTROLS-001](./active/PLAN-UI-ICON-CONTROLS-001/PLAN.md)：图标与控件文案整理——先确定图标来源与减字边界，再从公开 Mobile 控件试点。2026-09-28 立项，状态 ready。
