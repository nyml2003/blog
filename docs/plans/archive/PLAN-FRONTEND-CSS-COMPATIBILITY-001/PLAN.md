---
kind: plan
id: PLAN-FRONTEND-CSS-COMPATIBILITY-001
status: completed
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-01
---

# 前端 CSS 兼容性防线

## 范围决议（2026-10-01，代替原决策闸门）

- 本轮只采纳第 1 层"行为断言"，以 TDD 方式落地：先加断言，用真实问题或注入坏样式证明断言能红，再谈修复。
- 浏览器基线成文、静态兼容 lint、视觉回归推迟：基线需产品给出最低支持矩阵或部署后访问日志再定；视觉回归成本与不稳定率较高，单独决策。
- 覆盖范围定为 Mobile 公开页（Desktop、管理端、admin-preview 不在本轮）。
- `ops e2e` 保持独立验收命令定位，不并入快速门禁；CI 是否挂自动运行随 CI 策略单独决策。

交付与证据见 [RESULT.md](./RESULT.md)。

## 目标

为布局/CSS 兼容坑建立分层防线，避免再次出现"声明了但行为不对"的静默缺陷（触发案例：`position: sticky` 疑似被祖先 `overflow-x: clip` 破坏，见 `PLAN-MOBILE-COMPONENT-EXPERIENCE-001`）。坑有两层，防线也分两层：

1. **静态层（防"属性不支持"）**：浏览器基线 + 按基线数据检查 CSS 属性兼容性的 lint；
2. **动态层（防"支持但行为错"）**：真实浏览器里的定位/布局行为断言，以及（可选）视觉回归。

本计划只立项防线建设；各层是否采纳、用什么工具、覆盖范围由决策闸门确认，不预设。防线的有效性必须用"故意注入坏样式能让检查变红"验证，不以"检查是绿的"自证。

## 当前基线（2026-10-01 现场核实）

- **无浏览器基线**：仓库无 `.browserslistrc`，各 `package.json` 无 `browserslist` 字段；Vite/SW 构建的 target（如 es2020）是零散决定，不构成统一目标。
- **CSS 零 lint**：前端工具链为 Biome（格式）+ Oxlint（TS），均不覆盖 CSS；无 stylelint 或等价物。
- **动态层有雏形**：`ops e2e`（`apps/blog/src/e2e/e2e.ts`）已有横向溢出检测（378 行 offenders 扫描）和个别 rect 检查；无吸顶、底栏定位、safe-area 类行为断言；无截图对比。
- **知识沉淀空白**：`docs/GLOSSARY.md` 无 CSS 踩坑条目。
- **能力现状**：Playwright 栈已在（e2e、perf 共用），加行为断言的边际成本低；CI 有 build/release 流水线可挂检查。

## 候选防线（分层候选，不预授权全部）

按讨论中的性价比排序，供闸门参考：

1. **行为断言先行**：在 `ops e2e` 补定位/布局类断言——吸顶（滚动后 `getBoundingClientRect().top === 0`）、底栏常驻、safe-area、横向溢出（已有）。基建现成，最能抓住本次案例这类坑。
2. **浏览器基线成文**：以 browserslist 或等价形式落一份项目浏览器/设备目标；来源可以是产品要求或部署后的访问日志。
3. **静态兼容 lint**：基线落地后，CSS 侧接入按 browserslist 数据检查属性支持的 lint（工具选型由实现方提出）。
4. **视觉回归**：截图对比或托管服务。成本与不稳定率较高，是否纳入、何时纳入由闸门单独决策。
5. **踩坑知识沉淀**：GLOSSARY 增加"overflow 杀 sticky"等条目，本次案例为第一条。

## 决策闸门

- 浏览器/设备基线：最低支持矩阵（iOS Safari / Android Chrome 版本下限），数据来源与维护方式——产品决策；
- 各层采纳范围：本轮做哪几层、视觉回归是否纳入或推迟；
- 静态 lint 的工具选型与接入位置（`ops quality check` 内或独立命令）——实现方提出方案后确认；
- 覆盖范围：仅 Mobile 公开页，或含 Desktop 与管理端；
- 断言/检查的运行位置：`ops e2e` 保持独立验收命令的定位不变（不并入快速门禁），CI 是否挂自动运行。

## 成功标准

1. 闸门确认的每一层防线落地，且有"注入坏样式→检查变红"的有效性验证记录。
2. 吸顶、底栏定位、safe-area、横向溢出四类行为断言进入 `ops e2e` 并可在本地复跑。
3. 若采纳静态层：浏览器基线成文，lint 对基线外属性（含 `overflow: clip` 这类）可报警并接入约定入口。
4. GLOSSARY 落地首条 CSS 踩坑条目。
5. 相关 `ops` 命令、前端 typecheck/lint/test/build 通过；新增检查不影响既有命令退出码契约（`SPEC-OPS-OUTPUT-001`）。

## 非目标

- 不重写现有 CSS、不改变现有视觉行为（组件修正归 `PLAN-MOBILE-COMPONENT-EXPERIENCE-001`）。
- 不默认引入付费托管服务（Percy/Chromatic 类）；引入需闸门单独决策。
- 不做全量页面截图基线（除非闸门纳入）。
- 不动后端与公共 API。

## 约束与依据

- **写集协调**：`PLAN-MOBILE-COMPONENT-EXPERIENCE-001` 正在处理吸顶归因修复，且同样会写 `apps/blog/src/e2e/` 与 mobile styles——本计划与其在该目录串行，实施前互核最新状态；建议的衔接方式（它先修、断言后上，或断言先行复现）由两边执行时协调，不预设。
- `ops e2e` 的定位是"显式回归测试，不并入快速质量门禁"（`ops help` 现行语义），新增断言不改变该契约。
- 视觉回归若纳入，截图产物的存储位置（`target/` 不入库）与 CI 稳定性策略须一并设计。
- 依据：`SPEC-OPS-OUTPUT-001`（输出与退出码契约）、本次 sticky 案例的归因记录（组件体验计划产出后回链）。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 防线选型草案与浏览器基线建议 | frontend | -（可与组件体验计划并行） | 本目录选型记录 | 简化为范围决议，未单独成稿 |
| 决策闸门 | 产品+pm | 选型草案 | 本 PLAN.md 范围确认 | done（2026-10-01 范围决议） |
| 行为断言落地与有效性验证 | frontend | 闸门、与组件体验计划协调 e2e 写集 | `apps/blog/src/e2e/`、必要测试 | done |
| 静态层接入（若采纳） | frontend | 闸门、基线成文 | 浏览器基线文件、lint 配置、`ops` 对应命令 | 推迟（见范围决议） |
| 视觉回归（若采纳） | frontend | 闸门 | e2e 截图能力或服务接入 | 推迟（见范围决议） |
| 知识沉淀与收尾 | frontend+pm | 各层落地 | GLOSSARY、RESULT.md | done |

## 集成验收

1. 有效性证明：注入破坏 sticky 的样式跑断言必须红；移除后必须绿（每类断言至少一次）。
2. 基线外属性告警演示：`overflow: clip` 在既定基线下的 lint 输出。
3. `ops e2e --mode integration` 全旅程回归通过；perf 数字不受影响（纯测试代码改动）。
4. 闸门未采纳的层明确记录不采纳原因，留待后续复议。

## 未决项

全部未决项已随范围决议转为推迟项，去向与恢复条件见 [RESULT.md](./RESULT.md)：

- 浏览器/设备最低基线（待产品数据）。
- 静态层工具选型与接入位置。
- 视觉回归是否纳入。
- 覆盖范围扩展（Desktop/管理端/admin-preview）。
- CI 挂载方式。
