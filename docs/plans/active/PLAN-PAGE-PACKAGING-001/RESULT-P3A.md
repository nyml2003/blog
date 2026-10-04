# PLAN-PAGE-PACKAGING-001 · P3a 交付记录：@fluvient-loom/page-build-kit 抽取

2026-10-03 执行。P3a 完成（P3b/P3c/P3d 未开始，见 PLAN.md 工作流）。

## 交付

**新包 `packages/page-build-kit/`**（private workspace，对齐 persisted-state 包规格：typecheck/test/build/smoke 四件套 + README）：

- `src/types.ts`：`PageRegistration`/`PagePlatform`/`PageRoute` 契约 + `pageRoutes()` 纯投影——框架契约从宿主文件上收进包；
- `src/validate.ts`：14 条规则校验器（fs 全注入，无默认实现）；
- `src/generate.ts`：site-routes 生成（纯函数，canonical=aliases[0]）；
- `src/normalize.ts`：D11 归一化形态；
- `src/scaffold.ts`：脚手架纯逻辑（plan/insert/writeScaffold，IO 注入）+ `insertRegistration`（数组与文本插入同序）；
- `src/templates/*.txt`：页面/入口模板数据文件；
- `src/plugins/`：page-template / page-bootstrap（入口参数化，去 `settings.tsx` 硬编码）/ page-routes 三插件，全部去 `pageRegistry` 默认直连；
- `test/`：19 项纯注入测试（fixture 注册表）。

**宿主瘦身为消费方**：`src/frontend/vite-plugins/` 只剩 mobile-prefetch（宿主特有）；`src/frontend/page-registry/` 只剩 host glue（真实 fs/spawn/biome）+ 两个 CLI；vite.config / pages.registry / 守卫测试全部 import 包。

## 顺带修复的两个真 bug

1. **脚手架清单键序 bug**（本次真实回环暴露）：清单再生用"追加数组末尾"，注册表插入在"同平台组中"——键序不同导致字节比对失败。修复：`insertRegistration` 数组插入与文本插入同序（包内单测锚定）。
2. **package-guard 历史误杀 bug**：`KERNEL_SCOPES` 条目带尾斜杠又拼 `/`（匹配 `'@fluvient-loom//'`），所有 scope 子路径导入（port/nested-gesture 等）被误报——24 条基线误报横跨 command/gesture-web/mock/net/node/web。修复 + 两条回归单测。**`ops package check` 因此首次全绿**（此前文档记为"nix 二进制滞后"的基线，实为源码 bug）。

另：e2e 的 BrowserPage 接口补 `request` 事件（P1 加断言时用的是 playwright 原生事件，本地接口未声明——root typecheck 暴露的类型错）。

## 门禁配套

- `package-guard.ts` 新增 `BUILD_TOOL_PACKAGES` 类别（类比 HOST_ADAPTER 先例）：构建期包按设计运行于 Node/Vite，允许 `vite` 与 `node:*` 导入；平台全局禁令不变；
- 模板从 TS 字符串改为 `.txt` 数据文件：生成物里的 import 语句在 TS 源码字符串中会被中立性正则误判为真实依赖——模板本来就是数据，不是代码。

## 验证证据

| 项 | 结果 |
| --- | --- |
| 包自检 | typecheck 0 错 + 19/19 |
| **`ops package check`** | **三段全绿**（中立性门禁 / smoke / pnpm check）——含历史误报修复 |
| ops 套件 | 128 项 0 失败（+2 门禁回归测试） |
| 前端 | test:frontend 48/48、page:check 17 页/22 alias 一致、vite build ✓、typecheck 0 错 |
| 脚手架真实回环 | 走包路径执行（desktop 试点）→ 18 页状态 page:check/test 全绿 → 恢复 17 页基线（模板重构前执行；重构后模板内容由包内单测逐标记验证，文本逐字节同源于原内联字符串） |
| lint / format | 仅剩 persisted-state 进行中工作的既有 2 条（navigator-icons/navigator.tsx） |

## 环境受限项

- `ops quality check` 全量仍被 persisted-state 既有失败阻塞（同 001/002）；e2e 全量同因 mobile-home；两者待该计划收尾后复跑。

## 后续

- P3b：`@fluvient-loom/page-kit` 抽取（装配/mount/definePage，SPEC-ARCH-BOUNDARY-001 修订，foundation 归属闸门）；
- P3c：试点页面包 desktop-public-detail + registry 聚合产物；P3d：批量迁移。
