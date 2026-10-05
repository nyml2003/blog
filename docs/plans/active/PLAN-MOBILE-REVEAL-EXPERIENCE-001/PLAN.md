---
kind: plan
id: PLAN-MOBILE-REVEAL-EXPERIENCE-001
status: in-progress
owner: project-manager
created: 2026-10-05
last_reviewed: 2026-10-05
---

# 移动端骨架揭幕体验：撤壳时序与分层归因

## 目标

让 Mobile 文章详情（当前唯一接入 App Shell 的页面）的"骨架 → 内容"揭幕在真实设备上不出现中间态：内容先在骨架下方完成就绪，揭幕单调完成。

两轮反馈驱动：

1. **撤壳时机**（2026-10-05）：用户提出"等页面渲染完成后再撤销骨架屏，渲染完成前可以离屏渲染"。已落地 **A 撤壳时序**（双 rAF 门控）与 **E 正文单次解析**，随 `5a20cec` 提交并验证（见"已交付"）。
2. **分层现象**（2026-10-05 复查）：用户报告"先骨架屏，然后空白，然后线，然后内容，然后 m-atom-tag 渲染特别慢"。受控复现（headless Chromium）未能重现该分层，需环境/真机证据归因后决定后续修复（见"调查记录"）。

## 成功标准

1. 分层现象有结论：锁定根因（旧构建 / 真机渐进光栅化 / 其他假设之一），给出可重复证据；不以"无法复现"收尾。
2. 若确认为真机光栅化：按归因结论落地修复（候选见"待验证方向"），验收以逐帧 filmstrip 为准——揭幕无"空白/线稿"中间帧。
3. 回归不破：无 JS 壳契约、`#app` 终态可见、layout-shift ≤ 0.01、`ops quality check`。
4. 结论与未完成项写入 RESULT（允许 partial 收尾）。

## 已交付（A + E，随 `5a20cec` 提交）

- **A 撤壳时序**：`removeMobileAppShell` 改双 rAF 门控（`packages/solid/page-kit/src/mobile.tsx`）：首个 rAF 帧读 `#app.offsetHeight` 强制同步布局，让正文布局发生在骨架仍可见的帧内；下一帧删壳；100ms 定时器兜底后台标签页 rAF 暂停。
- **E 正文单次解析**：`ArticleBody` 去掉 JSX `innerHTML` prop（原与 effect 双写，长文同帧解析两遍）：`packages/app/mobile-shared/src/article-body/ui.tsx`、`packages/app/desktop-shared/src/article-body.tsx`。
- 证据（headless Chromium + integration 栈 + fixture）：
  - 时序探针（id=12，本地栈无节流）：内容挂载 @rAF 帧 0 → 壳删除 @帧 2；layout-shift = 0；
  - 无 JS：壳存在、`#app` 隐藏；终态 `#app` 可见、正文与 h1 非空；搜索高亮走 CSS Custom Highlight（rangeCount=1）；
  - `CI=true ops quality check` 全绿（48 项，exit 0）。
- 已知无关失败：`ops e2e --mode integration` 在 main 基线即失败于 `mobile-home: .mobile-header is missing`（stash 对照复现，非本计划引入）。

## 调查记录（分层现象，进行中）

受控复现：headless Chromium，6× CPU 节流 + ≈400kbps/150ms，长文 id=13（CDP screencast everyFrame + MutationObserver 时间线 + 逐帧像素分类）：

- DOM 时间线：first-paint 1097ms → DOMContentLoaded 1502ms → tag 与正文**同毫秒**入 DOM（2297.7ms）→ 壳删除 2348.7ms → FCP/LCP 2385ms；
- 合成帧只有三个状态：空白 @940ms（外链 CSS 阻塞期）→ 骨架 @2040ms → 完整内容含 tag @3242ms；**未出现"空白/线"中间帧**；
- 结构推理：分层不可能来自 DOM 阶段（正文与 tag 同帧挂载，骨架为纯 HTML 注入）；能产生该观感的只有（a）不含 A 的旧删壳时序、（b）揭幕帧之后的 paint/光栅过程、（c）采样漏帧。

待查假设（按验证成本排序）：

- **H1 旧构建**：观察时构建不含 A+E（local daemon / integration 栈 / 浏览器缓存）。旧时序=数据到达即删壳，恰好解释"骨架→空白→内容"；`mobile-prefetch` SW 的缓存范围需复核（此前记录只拦 `/api/.../category-shelf`，未最终确认）。
- **H2 真机渐进光栅化**：A 只把**布局**提前到骨架下方；`#app` 的 `visibility:hidden` 期间内容**不参与绘制**，揭幕帧才是正文的首次 paint/raster。低端真机上长文分 tile 光栅可能呈现"空白 → 部分文字 → 完整内容"；彩色 `m-atom-tag` 因所在 tile 或绘制顺序被感知为"特别慢"。headless 软件光栅太快，复现不出。
- **H3 采样局限**：headless screencast 仅 3 个独有帧，需有头浏览器（真 GPU）或真机 filmstrip 才能排除漏帧。

## 待验证方向（H2 若成立）

1. **内容预绘制**：把揭幕从"`visibility:hidden` 切换"改为"内容始终绘制、由不透明壳覆盖，删壳即露出"——`#app` 不再隐藏（涉及 HTML 模板契约），揭幕帧零首次 paint；需核对壳覆盖几何（长文低于折线部分的滚动暴露）与 `contain`/层级行为。
2. 若预绘制不可行：交叉淡入（原方案 B）遮罩中间态，或 raster 提示（`will-change`/分层）——以真机证据决定，不预设。
3. `m-atom-tag` 的 `color-mix()`/描边绘制成本单独度量，排除或确认其为独立因素。

## 非目标

- 不做其他页面（首页/列表/Desktop）的壳推广——延续 `PLAN-FRONTEND-APP-SHELL-001` 的 parked 状态，待本计划结论。
- 不改 `@fluvient-loom/app-shell` 包契约；若 H2 修复需要（如去 `visibility:hidden`），另行决策。
- 不做 Solid SSR / 构建期渲染（APP-SHELL-001 已留档为进阶）。

## 约束与依据

- 承接 `PLAN-FRONTEND-APP-SHELL-001`（试点 completed；其"其他公共页推广 parked: visual feedback"即本计划的触发）。
- 删壳契约与 `.loom-app-shell + #app{visibility:hidden}`（`packages/web/app-shell/src/shell.ts:190`）。
- AGENTS.md 验证标准：UI 行为需浏览器/真机证据；受环境限制的检查必须显式列出。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 撤壳时序 A+E | frontend | - | `packages/solid/page-kit/src/mobile.tsx`、两端 `article-body` | completed（5a20cec） |
| 分层现象复现与归因 | frontend+qa | 观察环境信息（H1） | 复现探针、必要时的 e2e | in-progress |
| 修复实施 | frontend | 归因结论 | `page-kit`/壳模板/样式（待定） | ready |

## 集成验收

- 归因验收：设备 × 浏览器 × 构建组合的 filmstrip 或等价证据链（含"该构建含 A+E"的指纹，如 dist 资源哈希）。
- 修复验收（若落地）：逐帧无中间态 + layout-shift ≤ 0.01 + 无 JS 壳契约 + `ops quality check`。
- 全链路回归：`ops e2e --mode integration`（当前存在既有失败，见上）在修复落地时逐项重跑。

## 未决项

- 观察环境未知：设备、浏览器、URL、构建时间——决定 H1/H2 验证优先序；需用户补充。
- 修复若走"内容预绘制"，涉及模板契约（去掉 `#app` 隐藏）与壳覆盖几何，需单独决策。
- 复现探针已存入本目录 `tools/`（`profile-reveal.mjs`、`screencast-reveal.mjs`、`analyze-frames.mjs`）；重建要点：CDP `Emulation.setCPUThrottlingRate(6)` + `Network.emulateNetworkConditions`（400kbps/150ms）+ `Page.startScreencast(everyFrame)` + MutationObserver 时间线 + 逐帧像素分类。
