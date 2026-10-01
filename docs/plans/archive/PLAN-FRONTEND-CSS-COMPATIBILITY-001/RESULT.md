# 计划结果

## 计划

- Plan ID：`PLAN-FRONTEND-CSS-COMPATIBILITY-001`
- 最终状态：`completed`（按 2026-10-01 决策收敛后的范围：本轮只采纳动态层行为断言，其余层推迟，见 PLAN.md 范围决议）
- 项目经理：`project-manager`

## 收尾说明

本计划立项时列出五层候选防线，采纳范围留给闸门。2026-10-01 决策：本轮只采纳第 1 层"行为断言"，以 TDD 方式落地（先加断言、用真实问题或注入坏样式验证断言能红，再谈修复）；浏览器基线、静态兼容 lint、视觉回归推迟（基线需产品给出支持矩阵或访问日志后再定）。收敛后的范围全部交付并验证。

## 实际交付

- **Mobile 公开页布局/CSS 行为断言矩阵**（`apps/blog/src/e2e/e2e.ts`，净增约 143 行）：5 个公开页 × 4 类断言，覆盖 17/20 格（约 85%）。
  - 吸顶：首页/文章库/分类浏览的 `.mobile-header`，以及文章库/分类浏览的 sticky 索引栏 `.category-root-list`（吸附位从 `--shell-header-sticky-top` 动态读取）；
  - 底栏常驻：`.m-bottom-nav` 滚动前后都贴视口底；详情页反向断言"必须无底栏"（产品基线）；
  - safe-area：注入 `--safe-area-top: 44px`/`--safe-area-bottom: 34px` 验证变量→padding 链路真实接通（header `max(8px,var)`、底栏 `calc(6px+var)`、详情页 reading-bar）；
  - 横向溢出：沿用 `assertPage` 内置检测，本次补齐有效性证据。
  - 短页（设置页）不做吸顶断言、详情页 reading-bar 非 sticky 不硬凑，避免假红/过度断言。
- **新增旅程**：integration 模式补 `mobile-home`、`mobile-settings`，详情页从裸截图改为完整 `assertPage`（含溢出检查与自动截图）。
- **断言缺陷修复**：底栏断言必须先回顶再读基准值——static 底栏在"滚到底"状态下 bottom 恰好等于视口高，会伪装贴底。该缺陷由底栏注入验证暴露。
- **归因结论（触发案例）**：当前 Chrome（headless，Playwright + 本机 Chrome 138 内核）下 `.mobile-shell` 的 `overflow-x: clip` **不破坏**后代 sticky（符合规范：clip 不创建滚动容器）。线上"不吸顶"的根因大概率不在该条；组件体验计划（`PLAN-MOBILE-COMPONENT-EXPERIENCE-001`）的归因工作流应优先查 `.mobile-preview-page` 的 `overflow-x: hidden`（规范上必然破坏内部 sticky）与真机 WebKit 差异。
- **知识沉淀**：`docs/GLOSSARY.md` 新增"CSS 踩坑"节及首条"overflow 杀 sticky"。

## 已验证内容

全部验证在 2026-10-01 本机执行（`ops e2e --mode integration`，Playwright 1.63 + 本机 Chrome headless，viewport 375×812）。

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| 断言矩阵全绿 | `ops e2e --mode integration` 通过（5 页旅程 + desktop 旅程不变） | passed |
| 吸顶断言有效性 | 注入 `overflow-x: clip→hidden`：红，`top=-5678, position=sticky`（声明在、行为失）；还原后绿 | passed |
| 底栏断言有效性 | 注入 `position: fixed→static`：红，回顶后 `bottomBefore=1329 ≠ 812`；还原后绿。注入同时暴露并促成"先回顶"缺陷修复 | passed |
| safe-area 断言有效性 | 注入 header padding 写死 `8px`（断开 `max(8px, var(--safe-area-top))` 链路）：红，`got 8px`；还原后绿 | passed |
| 溢出断言有效性 | 注入 `.mobile-shell { width: 130vw }`：红，`scrollWidth=488` + offenders 清单；还原后绿 | passed |
| clip 防线正证 | 注入 `.mobile-main { width: 130vw }`：被 clip 剪裁、无页面级滚动、断言不误报——clip 的设计价值得到直接证据 | passed |
| 静态检查 | `ops quality lint` 通过；`pnpm typecheck` 本次改动零新增错误（e2e.ts 存在 3 项基线预存错误：`getByLabel`×2、RegExp 入参×1，非本次引入，未处理） | passed |
| 退出码契约 | 新增断言走既有 `assertPage`/`OpsError` 路径，`ops e2e` 退出码语义不变（0/10/20，`SPEC-OPS-OUTPUT-001`） | passed |

## 生效变化

- Facts：无；
- Architecture：无（纯测试代码，不改运行时行为）；
- Specs：无；
- GLOSSARY：新增"CSS 踩坑"节首条。

## 推迟项与恢复条件（非本计划未完成项）

- 浏览器/设备基线成文 + 静态兼容 lint：恢复条件是产品给出最低支持矩阵或部署后访问日志；
- 视觉回归（截图对比）：成本与不稳定率较高，单独决策；
- 覆盖扩展到 Desktop/管理端/admin-preview 页：随各端出现等价风险或闸门决议再纳入；
- CI 挂载 `ops e2e` 自动运行：随 CI 策略单独决策；
- e2e.ts 基线预存的 3 项 typecheck 错误（`getByLabel` 缺失接口方法、RegExp 入参类型）：随下次 e2e 维护修复。

## 与并行计划的衔接

- `PLAN-MOBILE-COMPONENT-EXPERIENCE-001`：本计划已按约束先行落断言且未触碰 mobile styles（注入均已还原）；其"吸顶复现归因"可直接复用本断言与注入手法，方向建议见上文归因结论。
