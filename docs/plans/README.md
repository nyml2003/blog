# 计划

Plan 面向一个跨职能、可验收的产品结果，不面向单个文件或单个技术动作。

## 目录

- `active/`：当前执行中的计划；
- `archive/`：已完成或按用户要求结束的计划及结果、证据；
- `_template/`：新计划模板（2026-09-27 自 git 历史恢复）。

当前 active：

- [PLAN-FRONTEND-FSD-RESTRUCTURE-001](./archive/PLAN-FRONTEND-FSD-RESTRUCTURE-001/PLAN.md)：前端目录重组——从按技术层改为按功能切片（两平台世界 pages/widgets/features/foundation + kernel/domain/protocol/validation 底层），行为零变化的纯位置重构；核心交付"依赖只向下、同层不互引、两端互不导入"的层序门禁已落地并经变红演练；`SPEC-ARCH-BOUNDARY-001` 已修订生效。2026-10-01 立项并同日以 `completed` 收尾；遗留跟进项见其 RESULT.md（architecture.ts 旧样例收敛、CSS 按 slice 拆分暂缓）。
- [PLAN-FRONTEND-APP-SHELL-001](./active/PLAN-FRONTEND-APP-SHELL-001/PLAN.md)：前端 App Shell 与不抖骨架屏——HTML 模板注入页面框架与骨架（内联关键 CSS），JS 挂载前即可渲染；建立几何一致、迟到流光、刷新旧内容顶住三条不抖纪律，配 e2e layout-shift 断言。承接一期白屏窗口暂缓项，与 SW 预取互补；Mobile 公共页试点先行，Desktop 纳入与否经闸门确认。2026-10-01 立项，状态 ready。
- [PLAN-SEARCH-001](./active/PLAN-SEARCH-001/PLAN.md)：全文检索与搜索词高亮——从零建立文字搜索（现状"文章检索页"实为分类浏览）：标题/摘要/正文检索、结果列表高亮、详情页文内高亮定位；SQLite FTS 中文分词方案以 spike 数据经闸门选定，索引与快照同事务，性能预算约束在 2C2G 单机。2026-10-01 立项，状态 ready。
- [PLAN-FRONTEND-CODEC-PERSISTENCE-001](./active/PLAN-FRONTEND-CODEC-PERSISTENCE-001/PLAN.md)：Codec/Persistence 原语包抽取——把产品定款的持久化分层方案（业务/Codec/编排/Port/存储）先抽成 workspace 包独立验收：common 增补 `LoomError`+`cause`、新建 `@fluvient-loom/codec`（含单测，作为模板包）、persistence 原语归属闸门定、ADR 留档；前端接入归边界归一化计划试点。2026-10-01 立项，状态 ready。
- [PLAN-MOBILE-COMPONENT-EXPERIENCE-001](./active/PLAN-MOBILE-COMPONENT-EXPERIENCE-001/PLAN.md)：Mobile 组件与交互体验专项——吸顶问题（header 已声明 sticky 但疑似被祖先 overflow 破坏，先复现归因再修）先行，组件交互盘点后经闸门确认本轮修复项，真机/浏览器证据验收。2026-10-01 立项，状态 ready。
- [PLAN-CONTAINER-DEPLOYMENT-001](./active/PLAN-CONTAINER-DEPLOYMENT-001/PLAN.md)：低资源单机容器部署——结合现有 Product/Data、SQLite、nginx、systemd 和 Release，设计 2 核 2 GB 服务器上的可靠容器运行、备份、升级与回滚方案。2026-09-29 立项，状态 ready。
- [PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001](./active/PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001/PLAN.md)：部署预检与产物下载可观测性——在部署下载前检查网络可达性，统一阶段提示、进度、重试、错误诊断和机器输出。2026-09-30 立项，状态 ready。

已归档：

- [PLAN-NAV-ACTIONS-001](./archive/PLAN-NAV-ACTIONS-001/PLAN.md)：Mobile 顶栏操作——页面级 BFF 以 `modules[]` 聚合页面与导航数据，导航组件只消费归一化后的 `MobileNavigation`；收藏走本地 `PersistencePort`（无读者账号），分享归因服务端校验 token、明细保留 90 天；品牌区移除。`ops quality check`、E2E、perf 均通过。2026-10-01 立项并同日以 `completed` 收尾；Desktop 侧另立计划。

- [PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001](./archive/PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001/PLAN.md)：前端边界归一化——URL 参数/日期/taxonomy/编辑会话/设置解析集中到边界层（`route-input`、`taxonomy-input`、`editor-session-storage`、`settings-model+storage`、`category-input`），分类树回退定为 D 类保留并注释锚定；行为零变化，防御式写法显著下降。共享 persistence 协议双重缺失语义与 style guide 补严移出为后续项。2026-10-01 立项并同日以 `completed` 收尾；盘点见 INVENTORY.md。

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
