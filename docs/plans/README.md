# 计划

Plan 面向一个跨职能、可验收的产品结果，不面向单个文件或单个技术动作。

## 目录

- `active/`：当前执行中的计划；
- `archive/`：已完成或按用户要求结束的计划及结果、证据；
- `_template/`：新计划模板（2026-09-27 自 git 历史恢复）。

当前 active：

- [PLAN-SEARCH-001](./active/PLAN-SEARCH-001/PLAN.md)：全文检索与搜索词高亮——从零建立文字搜索（现状"文章检索页"实为分类浏览）：标题/摘要/正文检索、结果列表高亮、详情页文内高亮定位；SQLite FTS 中文分词方案以 spike 数据经闸门选定，索引与快照同事务，性能预算约束在 2C2G 单机。2026-10-01 立项，状态 ready。
- [PLAN-NAV-ACTIONS-001](./active/PLAN-NAV-ACTIONS-001/PLAN.md)：顶部导航操作——Mobile 顶栏升级为后退/搜索/收藏/分享/更多，Desktop 同能力不同位置；收藏与分享归因为全新公共 API 域。推进顺序：契约冻结 → 共享逻辑包（不含 UI）+ 后端 → 两端 UI 接入；收藏/归因形态经闸门决策。2026-10-01 立项，状态 ready。
- [PLAN-FRONTEND-CODEC-PERSISTENCE-001](./active/PLAN-FRONTEND-CODEC-PERSISTENCE-001/PLAN.md)：Codec/Persistence 原语包抽取——把产品定款的持久化分层方案（业务/Codec/编排/Port/存储）先抽成 workspace 包独立验收：common 增补 `LoomError`+`cause`、新建 `@fluvient-loom/codec`（含单测，作为模板包）、persistence 原语归属闸门定、ADR 留档；前端接入归边界归一化计划试点。2026-10-01 立项，状态 ready。
- [PLAN-MOBILE-COMPONENT-EXPERIENCE-001](./active/PLAN-MOBILE-COMPONENT-EXPERIENCE-001/PLAN.md)：Mobile 组件与交互体验专项——吸顶问题（header 已声明 sticky 但疑似被祖先 overflow 破坏，先复现归因再修）先行，组件交互盘点后经闸门确认本轮修复项，真机/浏览器证据验收。2026-10-01 立项，状态 ready。
- [PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001](./active/PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001/PLAN.md)：前端边界归一化专项——按既有 TS 规范收敛"外部输入在边界归一化"的执行偏差：防御式代码全量盘点分类后，经决策闸门确认范围与方案，试点先行、行为零变化地推开。2026-10-01 立项，状态 ready。
- [PLAN-CONTAINER-DEPLOYMENT-001](./active/PLAN-CONTAINER-DEPLOYMENT-001/PLAN.md)：低资源单机容器部署——结合现有 Product/Data、SQLite、nginx、systemd 和 Release，设计 2 核 2 GB 服务器上的可靠容器运行、备份、升级与回滚方案。2026-09-29 立项，状态 ready。
- [PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001](./active/PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001/PLAN.md)：部署预检与产物下载可观测性——在部署下载前检查网络可达性，统一阶段提示、进度、重试、错误诊断和机器输出。2026-09-30 立项，状态 ready。

已归档：

- [PLAN-FRONTEND-CSS-COMPATIBILITY-001](./archive/PLAN-FRONTEND-CSS-COMPATIBILITY-001/PLAN.md)：前端 CSS 兼容性防线——本轮采纳动态层：`ops e2e` 落地 Mobile 公开页 5 页 × 4 类布局/CSS 行为断言（吸顶、底栏常驻、safe-area 链路、横向溢出，覆盖约 85%），四类断言均有"注入坏样式→变红"有效性证据；确认当前 Chrome 下 `overflow-x: clip` 不破坏 sticky，归因方向移交组件体验计划；GLOSSARY 落地首条 CSS 踩坑条目。浏览器基线、静态 lint、视觉回归推迟。2026-10-01 立项并同日以 `completed` 收尾。

- [PLAN-FRONTEND-VITE-PLUGINS-DIRECTORY-001](./archive/PLAN-FRONTEND-VITE-PLUGINS-DIRECTORY-001/PLAN.md)：将 Vite 插件从 `src/frontend/build/` 收敛到 `src/frontend/vite-plugins/`，与 wasm 构建脚本等非插件工具分离；测试目录改名对齐，内联 dev 路由插件一并迁出。纯位置调整，构建产物清单前后一致。2026-10-01 立项并同日以 `completed` 收尾。

- [PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-002](./archive/PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-002/PLAN.md)：Mobile 非首次访问预取与响应复用。2026-09-30 立项，2026-10-01 以 `completed` 收尾；预取包、Service Worker 接入和部署验收完成，其他体验审计及长期观测移交后续专项。

- [PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001](./archive/PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001/PLAN.md)：Frontend 新基线与旧架构清理——为 Desktop/Mobile 统一页面生命周期和依赖装配，全部 17 个页面接入 `app/bootstrap`，删除 `solid`、旧 `common` 运行链、旧 Mobile UI 与无消费者的旧 UI 层。2026-09-30 立项，2026-10-01 以 `completed` 收尾；`ops quality check`、构建、删除后 HTTP smoke 与真实浏览器 E2E 验收通过。

- [PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001](./archive/PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001/PLAN.md)：收敛 `app/infrastructure` 适配器到 `@fluvient-loom/web`/`node`，协议统一到 `port`+`common`，kernel 收缩为 desired-state，消费者直连 workspace 包并删除重复实现。2026-09-30 立项、执行并以 `completed` 收尾；包测试、前端全量检查与 `ops quality check` 通过。`ops package check` 中立护栏对 cli-*/atoms 的历史失败与 npm 发布决策见收尾记录。

- [PLAN-SCRIPTS-REMOVAL-001](./archive/PLAN-SCRIPTS-REMOVAL-001/PLAN.md)：移除根目录 `scripts/`，将 WASM 构建、package smoke、浏览器专项和工具配置迁入明确归属。2026-09-30 立项、执行并收尾，状态 completed；`scripts/` 已删除，迁移经 `ops quality check`、`test:core`、`ops e2e` 入口验证，用户验收通过。护栏 scope 策略等外部事项已移交并行工作流。

- [PLAN-MOBILE-H5-SOLID-ATOMS-001](./archive/PLAN-MOBILE-H5-SOLID-ATOMS-001/PLAN.md)：将新 Mobile H5 Solid UI 原子组件抽取为 `@fluvient-loom/mobile-h5-solid-atoms` workspace 包，完成包边界、样式和博客消费验收。2026-09-30 立项并完成，状态 completed。

- [PLAN-OPS-FRAMEWORK-001](./archive/PLAN-OPS-FRAMEWORK-001/PLAN.md)：ops 框架解耦与 installer 插件化。2026-09-27 立项，2026-09-29 以 `partial` 收尾；本地实现、测试和 bundle 验证完成，CI 发布与真实服务器验收未执行。
- [PLAN-FRONTEND-PAGE-COMPOSITION-001](./archive/PLAN-FRONTEND-PAGE-COMPOSITION-001/PLAN.md)：详情页职责边界与新 Mobile 文章详情试点。2026-09-28 立项，2026-09-29 以 `partial` 收尾。
- [PLAN-FRONTEND-E2E-001](./archive/PLAN-FRONTEND-E2E-001/PLAN.md)：前端浏览器端到端测试——建立由 `ops` 管理的 TypeScript runner。2026-09-29 立项，2026-09-30 以 `partial` 收尾；真实公开端和 Mock 管理端旅程已验证，真实 Product 管理凭证、CI、连续运行和 trace/video 策略留待后续专项。
- [PLAN-FRONTEND-MOBILE-ROLLOUT-001](./archive/PLAN-FRONTEND-MOBILE-ROLLOUT-001/PLAN.md)：新 Mobile 页面逻辑全面收敛。2026-09-29 立项，2026-09-29 以 `completed` 收尾。
- [PLAN-BLOG-DEPLOY-SELF-UPDATE-001](./archive/PLAN-BLOG-DEPLOY-SELF-UPDATE-001/PLAN.md)：`blog-deploy` 自更新——从稳定 `script-v*` Release 校验并原子替换安装器，失败可回退，不自动重启业务服务。2026-09-29 立项，2026-09-30 以 `completed` 收尾；本地、CI、隔离目录和服务器验收完成。
- [PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001](./archive/PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001/PLAN.md)：Mobile 体验优化——建立 `ops perf mobile` 度量能力后，针对部署反馈的切换慢与底栏抖动落地静态缓存、gzip 与 site-routes 内嵌（弱网切换耗时 -71%），并顺带修复发布 CI 工具链漂移。2026-09-30 立项，2026-09-30 收尾时按产品决策将范围收敛为本轮交付项并以 `completed` 收尾；审计清单与其余产品题移出，移交后续 Mobile 体验计划。
- [PLAN-OPS-OUTPUT-STANDARD-001](./archive/PLAN-OPS-OUTPUT-STANDARD-001/PLAN.md)：ops 输出标准化——统一人类输出、stdout/stderr、JSON/NDJSON 事件、错误码、诊断和敏感信息脱敏。2026-09-29 立项，2026-09-30 以 `completed` 收尾。
- [PLAN-RELEASE-ONE-CLICK-001](./archive/PLAN-RELEASE-ONE-CLICK-001/PLAN.md)：一键发布 Build 与 Script。2026-09-29 立项，同日以 `completed` 收尾。
- [PLAN-UI-ICON-CONTROLS-001](./archive/PLAN-UI-ICON-CONTROLS-001/PLAN.md)：图标与控件文案整理。2026-09-28 立项，2026-09-29 以 `completed` 收尾。
