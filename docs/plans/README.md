# 计划

Plan 面向一个跨职能、可验收的产品结果，不面向单个文件或单个技术动作。

## 目录

- `active/`：当前执行中的计划；
- `archive/`：已完成或按用户要求结束的计划及结果、证据；
- `_template/`：新计划模板（2026-09-27 自 git 历史恢复）。

当前 active：

- [PLAN-MOBILE-WEAPP-001](./active/PLAN-MOBILE-WEAPP-001/PLAN.md)：Mobile 微信小程序支持与包边界净化——开发任务：先拆包后接端，把 URLSearchParams/Intl/fetch 内核等 Web 宿主原语从"平台中立"包清出，拆开 mobile-api/page-kit/mobile-shared 混装包，依赖精准化并扩展门禁；再以原生小程序语法让 home/articles/detail/settings 四页在开发者工具中对 Mock/Product 调通。红线：不允许一段代码同时兼容 web 和小程序，也不为两端统一发明抽象；部署发布不在本次范围。2026-10-07 立项，状态 ready。

- [PLAN-LOCAL-RESIDENT-DEPLOY-001](./active/PLAN-LOCAL-RESIDENT-DEPLOY-001/PLAN.md)：本地常驻部署——打包产物在个人机器常驻（`ops local install|uninstall`：macOS LaunchAgent / Linux systemd 用户单元，配置驱动零环境变量），GitHub 真源启动同步，构建期工作台入口开关与 loopback 免 GUI 登录（bypass）；macOS 主路径已跑通（崩溃自愈、幂等重装、3 篇线上文章同步、bypass 验证），Linux/浏览器验收与收尾待做；与 PLAN-DELIVERY-COMPONENT-RELEASE-001 在 `deploy/` 有潜在写集交叉。2026-10-05 立项，状态 in_progress。
- [PLAN-MOBILE-REVEAL-EXPERIENCE-001](./active/PLAN-MOBILE-REVEAL-EXPERIENCE-001/PLAN.md)：移动端骨架揭幕体验——撤壳时序优化（双 rAF 门控 + 正文单次解析，已随 `5a20cec` 交付并验证）与用户报告的"骨架→空白→线→内容→tag 慢"分层现象的复现归因：受控复现（headless Chromium 6× 节流）未重现，待观察环境确认（H1 旧构建）与真机光栅证据（H2），候选修复含"内容预绘制/交叉淡入"；承接 PLAN-FRONTEND-APP-SHELL-001 的 visual feedback 反馈。2026-10-05 立项，状态 in-progress。
- [PLAN-DELIVERY-COMPONENT-RELEASE-001](./active/PLAN-DELIVERY-COMPONENT-RELEASE-001/PLAN.md)：前后端独立构建与组件化发布——基于调研（产物层已解耦：Product 运行时挂载 web/dist、包内 bin 与 dist 分离、script/build 双发布线先例；耦合全在流水线：一条命令双构建、单一 tar、单一 build tag、安装器只会挑整包）分三阶段拆分：L1 构建范围参数与预构建复用 → L2 产物拆分 + manifest format 2（补齐 web/dist 哈希缺口）→ L3 web/backend 独立发布线与安装器组件化；版本配对策略（G1）为 L2 前置决策闸门。与 PLAN-CONTAINER-DEPLOYMENT-001 在 `deploy/` 有潜在写集重叠，交叉处先对齐。2026-10-05 立项，状态 ready。
- [PLAN-MOBILE-PERSISTED-STATE-001](./active/PLAN-MOBILE-PERSISTED-STATE-001/PLAN.md)：Mobile 持久化 UI 状态能力与 SOP——修复详情页收藏状态不恢复（组件创建时 `favoriteKey` 未到达导致读路径死代码），沉淀 `createPersistedRecord` 轻量原语 + favorites 单文档 store + `MobileNav` 状态/回调契约，配 source-layout 执法测试、e2e 刷新恢复回归与 `persisted-ui-state` SOP 文档；与 PLAN-FRONTEND-CODEC-PERSISTENCE-001 写集零重叠，theme 双真相记为后续项。2026-10-02 立项，状态 ready。
- [PLAN-QUALITY-GOVERNANCE-001](./active/PLAN-QUALITY-GOVERNANCE-001/PLAN.md)：质量治理——修复 `ops package check` 中立性误报，补齐真实 runtime 与浏览器验收证据，并统一 active/archive 计划状态和质量命令分层。2026-10-02 立项，状态 ready。
- [PLAN-FRONTEND-FSD-RESTRUCTURE-001](./archive/PLAN-FRONTEND-FSD-RESTRUCTURE-001/PLAN.md)：前端目录重组——从按技术层改为按功能切片（两平台世界 pages/widgets/features/foundation + kernel/domain/protocol/validation 底层），行为零变化的纯位置重构；核心交付"依赖只向下、同层不互引、两端互不导入"的层序门禁已落地并经变红演练；`SPEC-ARCH-BOUNDARY-001` 已修订生效。2026-10-01 立项并同日以 `completed` 收尾；遗留跟进项见其 RESULT.md（architecture.ts 旧样例收敛、CSS 按 slice 拆分暂缓）。
- [PLAN-FRONTEND-APP-SHELL-001](./active/PLAN-FRONTEND-APP-SHELL-001/PLAN.md)：前端 App Shell 与不抖骨架屏——HTML 模板注入页面框架与骨架（内联关键 CSS），JS 挂载前即可渲染；建立几何一致、迟到流光、刷新旧内容顶住三条不抖纪律，配 e2e layout-shift 断言。承接一期白屏窗口暂缓项，与 SW 预取互补；Mobile 公共页试点先行，Desktop 纳入与否经闸门确认。2026-10-01 立项，同日以 `completed` 收尾（包 + Mobile 详情试点）；Desktop 与其他页面推广 parked，由 PLAN-PAGE-TRANSITION-FRAMEWORK-001 承接。
- [PLAN-SEARCH-001](./archive/PLAN-SEARCH-001/PLAN.md)：全文检索与搜索词高亮——从零建立文字搜索（现状"文章检索页"实为分类浏览）：标题/摘要/正文检索、结果列表高亮、详情页文内高亮定位；SQLite FTS5 trigram 与短词 `LIKE` 回退、独立 `@fluvient-loom/text-highlight` workspace 包、Desktop/Mobile 同轮交付。2026-10-01 立项并同日以 `completed` 收尾；公共 npm 发布、限速、量化性能预算和浏览器矩阵另列后续议题。
- [PLAN-FRONTEND-CODEC-PERSISTENCE-001](./active/PLAN-FRONTEND-CODEC-PERSISTENCE-001/PLAN.md)：Codec/Persistence 原语包抽取——把产品定款的持久化分层方案（业务/Codec/编排/Port/存储）先抽成 workspace 包独立验收：common 增补 `LoomError`+`cause`、新建 `@fluvient-loom/codec`（含单测，作为模板包）、persistence 原语归属闸门定、ADR 留档；前端接入归边界归一化计划试点。2026-10-01 立项，状态 ready。
- [PLAN-MOBILE-COMPONENT-EXPERIENCE-001](./active/PLAN-MOBILE-COMPONENT-EXPERIENCE-001/PLAN.md)：Mobile 组件与交互体验专项——吸顶问题（header 已声明 sticky 但疑似被祖先 overflow 破坏，先复现归因再修）先行，组件交互盘点后经闸门确认本轮修复项，真机/浏览器证据验收。2026-10-01 立项，状态 ready。
- [PLAN-CONTAINER-DEPLOYMENT-001](./active/PLAN-CONTAINER-DEPLOYMENT-001/PLAN.md)：低资源单机容器部署——结合现有 Product/Data、SQLite、nginx、systemd 和 Release，设计 2 核 2 GB 服务器上的可靠容器运行、备份、升级与回滚方案。2026-09-29 立项，状态 ready。
- [PLAN-PAGE-TRANSITION-FRAMEWORK-001](./active/PLAN-PAGE-TRANSITION-FRAMEWORK-001/PLAN.md)：页面加载态框架——把 App Shell 单页试点升级为跨端多形态（骨架/文字/指示器/进度/旧内容顶住/none）且页面可配置的加载态框架：场景×形态解析、两端 LoadingView 收敛、Desktop 骨架与删壳链路、chunk 失败兜底、持久化快照候选，以两端 e2e 与 perf 基线验收；与 PLAN-MOBILE-REVEAL-EXPERIENCE-001、PLAN-MOBILE-COMPONENT-EXPERIENCE-001、PLAN-MOBILE-PERSISTED-STATE-001 有写集/接口交叉，实施前需闸门确认。2026-10-06 立项，状态 ready。
- [PLAN-OPS-EFFECTS-001](./active/PLAN-OPS-EFFECTS-001/PLAN.md)：ops 效果协议与插件化执行策略——把命令副作用收口为结构化效果 + real/dry-run/test 可替换策略，最大化复用 `packages/ts` 端口（ReversibleCommand、NetworkPort、OperationId/Scheduler、HTTP 重试内核），以三道门禁（类型/架构扫描/全命令 dry-run 一致性）保证终态：命令拿不到原语、dry-run 成为派发策略；release 纵切片先行，随后分批迁移 20 个命令与 installer；与 PLAN-QUALITY-GOVERNANCE-001 在 `package-guard.ts` 有潜在写集交叉。2026-10-06 立项，状态 in_progress。

已归档：

- [PLAN-PAGE-DISCOVERY-001](./archive/PLAN-PAGE-DISCOVERY-001/PLAN.md)：页面发现机制与低成本接入（设计讨论）——事实探查（INVENTORY：7 项开放问题逐项回答）+ 决策（DECISIONS：D1–D11，含设计原则与同 URL 双端分流目标模型）；D11 停泊待触发，Rust UA 分流另立计划。2026-10-03 立项并同日以 `completed` 收尾；决策文档保留为后续计划活引用。
- [PLAN-PAGE-ONBOARDING-001](./archive/PLAN-PAGE-ONBOARDING-001/PLAN.md)：页面接入 P1——校验、生成与桌面首绘内嵌：注册表校验器（14 规则）、site-routes.json 生成器（落地即零 diff）、vite 配置加载期 fail fast（变红证据）、`ops page check` + CI 步骤、Desktop 构建期内嵌（e2e 红绿对）。2026-10-03 立项并同日以 `completed` 收尾；交付物已搬入 @fluvient-loom/page-build-kit（P3a）。
- [PLAN-PAGE-ONBOARDING-002](./archive/PLAN-PAGE-ONBOARDING-002/PLAN.md)：页面接入 P2——脚手架 `ops page new`（校验先行、违例零落盘、真实树回环验证）。2026-10-03 立项并同日以 `completed` 收尾；其后脚手架被"接口而非模板"决策退役（见 DISCOVERY-001 DECISIONS 修订），本文为历史执行记录。
- [PLAN-PAGE-PACKAGING-001](./archive/PLAN-PAGE-PACKAGING-001/PLAN.md)：页面与基建 npm 包化——三层包形态落地：`@fluvient-loom/page-build-kit`（构建链半边）、`@fluvient-loom/page-kit`（运行时半边，唯一装配点）与 `@blog/page-*` 页面包（apps/pages/*，17/17 全量）；注册表 100% 显式 import 聚合；收尾后演进含 bootstrap 统一入口（32→3 文件）、entry 字段退役、模板 hyperscript 化。全门禁绿（清单零 diff / 前端 47+7+18 / ops 117 / package check 三段 / CI 同款命令实跑）。2026-10-03 立项，2026-10-04 以 `completed` 收尾（RESULT-P3A/P3B/P3C/STRUCTURE/P3D）。


- [PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001](./archive/PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001/PLAN.md)：部署预检与产物下载可观测性——`@fluvient/core` 统一 Result/取消原语并新增 `/http` 传输内核（分档超时/流式进度/错误分类/可选重试），`@fluvient-loom/net` 收敛重复 fetch 适配器；三个下载型命令统一网络预检（DNS/TCP/TLS/API/资产探测）、进度条与 `--json` 事件流、稳定错误码、`--package` 离线安装。blog-deploy 21/21 测试、全仓 typecheck/test、bundle 冒烟、真实受限网络服务器实测均通过。2026-09-30 立项，2026-10-01 以 `completed` 收尾。

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
