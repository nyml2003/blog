# PLAN-PAGE-PACKAGING-001 · P3b 交付记录：@fluvient-loom/page-kit 抽取

2026-10-04 执行。P3b 完成（P3c/P3d 未开始）。

## 交付

**新包 `packages/page-kit/`**（private workspace）：

- `src/shared.ts`（root "."，纯逻辑）：挂载点解析（`requireMountTarget`）；
- `src/mobile.tsx`（"./mobile"）：`createWebMobilePorts()`（11 项浏览器端口装配，原 bootstrap 70 行机制体）、`mountMobileApplication()`（通用挂载：context 失败 → 清理钩子 + StartupError；成功 → 挂载 + afterMount 增强钩子）、`removeMobileAppShell()`、Mobile StartupError 组件；
- `src/desktop.tsx`（"./desktop"）：`createWebDesktopPorts()`、`mountDesktopApplication()`、Desktop StartupError；
- 导出面执行 D6 决策：root 仅纯逻辑，两端组件各留各的子路径——UI 隔离边界在包内成立。

**宿主瘦身为"声明组合 + 调用"**：

- `bootstrap/mobile/environment.tsx`：只剩应用声明（`createMobileApi` 工厂、内嵌清单 parse、prefetch 策略）+ 调用 kit；对页面导出的 `mountMobilePage`/`removeMobileAppShell` 接口不变，**零页面文件改动**；
- `bootstrap/desktop/environment.tsx`：同构（api 工厂 + 内嵌清单 + mount）；
- `mobile/foundation/context.ts`：`MobilePageContext` 改为 type-only 继承 `WebMobilePorts` + 追加 api/routes——端口形状唯一声明进包，声明零重复；
- `desktop/foundation/context.ts`：保持应用声明形状（desktop 的 network 由 api 消化，不进 context），类型引用 kit 端口。

**门禁配套**：package-guard 注册 `page-kit` 为 HOST_ADAPTER（允许 window/document/navigator 平台全局；不豁免 node 导入）+ solid-js 白名单（挂载用渲染框架，与 atoms/persisted-state 同先例）。

**SPEC-ARCH-BOUNDARY-001 修订**（D6.4 已批准的表述落地）："bootstrap 是唯一允许装配宿主适配器的层" → "**page-kit 是宿主适配器的唯一装配点，bootstrap 是唯一调用点**"；装配从 17 个页面入口收敛为包内一处，不变式强度增加；附修订记录。

## definePage 处置

本阶段未引入 definePage API——按 D6.3（需两个真实页面样本验证后定稿），其第一样本是 P3c 试点页，API 随试点成形。bootstrap 现有的"组合声明 + 调用"形态已是 definePage 的雏形（声明式工厂入参）。

## 验证证据

| 项 | 结果 |
| --- | --- |
| page-kit typecheck | 0 错 |
| 前端 | typecheck 0 错、test:frontend 48/48、vite build ✓ |
| root typecheck | 0 错 |
| ops 套件 | 128 项 0 失败 |
| `ops package check` | 三段全绿（中立门禁含 page-kit 新类别） |
| **e2e（integration 实跑）** | 桌面旅程 + 全部 mobile shell 变体（4 主题变体 + no-js）通过 page-kit 运行时全绿；唯一失败仍为既有 `mobile-home: .mobile-header is missing`（persisted-state 进行中工作，归属见 001 RESULT） |
| source-layout | 仅既有 2 条 in-flight 违例，本阶段零新增 |
| lint / format | 仅既有 2 条（navigator 系） |

## 实施注记

- JSX 需 `.tsx` 后缀（初版 `.ts` 报解析错）——exports map 同步指向 `.tsx`；
- Desktop context 不继承 `WebDesktopPorts`：desktop 的 network 由 api 客户端内部消化，从不进 context——继承会把 network 强加给全部 11 个桌面页的输入类型（typecheck 抓住，恢复应用声明形状）。

## 后续

- P3c：试点页面包（desktop-public-detail 转 workspace 包）+ registry 聚合产物 + definePage 第一样本；foundation 归属闸门在此定；
- P3d：批量迁移。
