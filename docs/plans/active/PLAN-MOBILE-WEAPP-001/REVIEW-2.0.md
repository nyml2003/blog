---
kind: review
id: REVIEW-MOBILE-WEAPP-002
plan: PLAN-MOBILE-WEAPP-001
status: delivered
created: 2026-10-07
last_reviewed: 2026-10-07
reviewer: reviewer
---

# Mobile 微信小程序支持——独立复核 2.0

> 本文是 [PLAN-MOBILE-WEAPP-001](./PLAN.md) 的独立复核 2.0，覆盖 1.0（PLAN.md「独立复核与调研」节）之后的工作树快照，并补充复用度、数据任务语义与文章渲染三块专项分析。不改写执行记录，不修改任何实现。

## 复核范围与方法

- 对象：`apps/weapp`、`packages/weapp/mobile-host`、`packages/ts/mobile-foundation`、`packages/app/mobile-api`、`packages/solid/page-kit`、`apps/blog/src/quality/package-guard.ts` 等当前工作树（未提交改动 108 项，执行流仍在并发改动）。
- 方法：源码走读 + `target/weapp` 构建产物实测 + 官方文档核对（Skyline、rich-text、按需注入、初始渲染缓存、体验评分、数据预拉取）。
- 已执行：`pnpm exec tsx --test apps/blog/test/commands/package-guard.test.ts`（10/10 通过）、`node apps/weapp/build.mjs --check`（通过）、产物尺寸统计、依赖使用扫描。
- 未执行：微信开发者工具/真实宿主联调（机器无该工具），因此所有交互类结论以官方文档与源码推断为准。

## 一、结论

1. **包边界净化（P0）方向正确且大多落地**：协议包去 Solid/去 `URLSearchParams`、页面契约拆分（`page-contract`）、纯逻辑下沉（`mobile-foundation`）、fetch 内核移出中立域（`web-http`）都真实生效，H5 未回归。
2. **小程序侧仍停留在"能编译、能冒烟"，五个关键验收点未过**：链接交互、主包体积、Skyline 决策、tab 导航（仅栈增长缓解）、主题跨页。1.0 的 F1–F7 中 F4 部分修，其余截至本次快照未修。
3. **新增三类问题**：一是页面对 `DataTask` 的消费方式绕过了 `DataResource`（无取消、无竞态保护、`.catch` 死代码）；二是复用面偏窄（高亮/设置值域/收藏模型各自重复）；三是导航与存储在 handler 里直接摸宿主（无路由单一来源、无栈语义集中层、无持久化适配器）。
4. **门禁覆盖不达标**："声明=使用"只查了半程，现存未使用依赖 5 处、类别漏洞 2 处；weapp 的 lint/类型检查未进任何常规门禁，`quality check` 与 `package check` 覆盖面不对称（R6）。

## 二、1.0 遗留问题现状（截至本次快照）

| 编号 | 1.0 结论 | 现状 | 证据 |
| --- | --- | --- | --- |
| F1 `rich-text` 链接不可点 | 高 | **未修**；仍 `bindtap="openLink"` + `data-url` | `apps/weapp/pages/detail/detail.wxml`、`detail.ts:34-38` |
| F2 主包体积检查量错对象 | 高 | **未修**；三页各带一份 zod（814/818/820 KB），检查只量 `lib/api.cjs` | `apps/weapp/build.mjs:46-50`；产物实测 |
| F3 G7 未决却全局 Skyline | 中 | **未修**；`app.json` 仍 `"renderer": "skyline"` | `apps/weapp/app.json:5` |
| F4 tab 导航语义 | 中 | **部分修**；tab 互跳已改 `wx.reLaunch`（栈增长问题缓解），但无原生 tabBar 决策、直达进入的返回兜底无集中处理，导航仍散在各 handler | `articles.ts:53-55`、`home.ts:25-28` |
| F5 主题/字体未跨页 | 中 | **未修**；仅设置页自身应用 | `settings.ts:17-19`；无其他页读取 |
| F6 依赖门禁只查一半 | 中 | **未修**；仍跳过三方包、混入 dev/peer、无"未使用"检查 | `package-guard.ts:149`、`package-check.ts:37-42` |
| F7 类别/构建小项 | 低 | **未修**；weapp 仍放行 `node:fs/node:path`，`net` 仍在中立 ts 类，产物仍带 `test/` | `package-guard.ts:59`；`target/weapp/test/` |

## 三、新增发现

### R1 页面对 DataTask/DataResource 的消费方式不符合设计（高）

三个请求页面全部采用 `api.xxx.get(...).start().then(...)` 直连写法，绕过了 `createDataResource` 的全部语义：

- **无取消**：`weapp-host` 已把 `signal` 接到 `task.abort()`（`packages/weapp/mobile-host/src/index.ts:12`），但页面从不取消上一个请求，`onUnload` 也没有清理。切换分类/快速重试时旧请求继续跑。
- **无竞态保护**：没有 generation guard。快速切分类 A→B，B 先回、A 后回时 A 覆盖 B。H5 侧 `createDataResource` 正是为此设计（`packages/ts/query/src/resource.ts:54,73-74,84`：新任务先取消旧任务，过期代结果直接丢弃）。
- **`.catch()` 是死代码且会误诊**：按契约 `start()` 永远 resolve 成 `Result`，网络错误经 `mapRejected` 映射（`mobile-api/src/client.ts:156`）、取消也 resolve。该 catch 唯一能捕获的是 `.then` 回调自身抛错（如 `toFShelfModel`/`setData`），却谎报"网络请求失败，请重试"（`articles.ts:32,46`、`detail.ts:26`、`home.ts:22`）。
- **手动状态机与共享词汇脱节**：页面自造 `loading/error/empty/ready`，而 `mobile-foundation` 已定义 `ShelfStatus` 与 `fshelfStatus`（`shelf.ts:4,111-113`）却 0 处使用；`TShelfIntent`/`FShelfIntent` 同样 0 使用。
- **`cancelled` 无法识别**：`result.error` 为 `{kind:"cancelled"}` 时被 `errorMessage` 显示成"请求执行失败"。
- **搜索无防抖**：`articles.ts:19-24` 每次 `input` 都发请求，打字快即请求风暴 + 乱序覆盖。

正确做法：`createDataResource` 宿主中立（`@fluvient-loom/query`，零 DOM），weapp 可直接建一个极薄绑定——`subscribe` 里把状态映射为 `setData`，切换走 `refetch()`，`onUnload` 里 `unsubscribe + cancel`，错误渲染前先判 `kind === "cancelled"`。无需引入 Solid。

### R2 复用度评估（中）

| 层 | 复用程度 | 说明 |
| --- | --- | --- |
| 协议客户端 + schema（`mobile-api` ~588 行） | **高** | 两端同一 `createMobileApi`，schema/解码/错误归一全共享；weapp 仅 6 行胶水 |
| 货架纯逻辑（`mobile-foundation` ~166 行） | **高** | `toTShelfModel`/`toFShelfModel`/`fshelf*` 两端都用；有独立测试 `shelf.test.ts` |
| 资源状态机（`DataResource`） | **低** | 仅 H5 经 `mobile-resource`（21 行）使用；weapp 自写劣化版（见 R1） |
| 标题高亮 | **重复三次** | `apps/weapp/src/article-list.ts:5` 的 `highlightTitle`；H5 页面 `HighlightedText`（`mobile-articles/src/page.tsx:195-215`）；底层 `findTextMatches`（`text-highlight/src/index.ts:12`） |
| 设置值域 | **重复两份** | H5 `settings-model.ts`（类型/选项/`normalize`）；weapp 硬编码数组、默认值与校验（`settings.ts:8-24`） |
| 收藏模型 | **分叉两份** | H5 单文档 `blog.mobile.favorites.v1` + 损坏归一（`favorites.ts:7`）；weapp 逐篇 `blog.favorite.<id>` 布尔值 |
| UI/路由 | **0（设计如此）** | Solid JSX vs WXML；site-routes vs 硬编码 `/pages/*` |

量级：weapp 全部 TS 约 313 行，其中平台必须的 `rich-text.ts` 107 行；真正重复约 28 行（高亮 24 + 错误 4），其余为页面胶水。结论：**weapp 用约百行胶水换来 700 行级共享逻辑，比例健康；再提收益应统一高亮与设置值域，而非把 UI 拉进共享层**。

### R3 文章渲染现状与风险（中）

上游同一份 `article-html/v1` 校验过的 HTML（`src/core/article-html-core/src/profile.rs:3-5`），两端渲染管线完全不同：

- **H5**：`mobile-shared/src/article-body/ui.tsx` 直接 `innerHTML`，信任服务端校验；样式由系统主题 `.article-body` CSS 提供；搜索词经 `text-highlight/web` 高亮并 `focus(0)`。
- **weapp**：`apps/weapp/src/rich-text.ts` 自写 tokenizer/parser 转 `rich-text` 节点；失败整页 error；`detail.wxss` 仅 `.page`，无正文样式；无 query 高亮。

风险：链接不可点（F1）；正文样式缺失使表格/标题渲染与 H5 差距明显；解析器复刻了服务端校验子集（比服务端宽松），存在双份真相漂移；H5 走 BFF page 模块而 weapp 走细端点，分享/导航语义各自实现。

### R4 共享包死代码与依赖精度（低-中）

- `mobile-foundation`：`ShelfStatus`/`fshelfStatus`/`TShelfIntent`/`FShelfIntent` 均 0 使用，应删除或接入。
- 未使用依赖：`page-kit` → `@fluvient/core`、`@fluvient-loom/app-shell`、`@fluvient-loom/query`、`@fluvient-loom/serde`；`mobile-resource` → `@blog/mobile-api`。
- `build.mjs` 复制过滤把 `test/`、空 `node_modules/` 带进 `target/weapp`。
- `ts/net` 依赖 `web-http`（web 类）却仍在 `ts` 类，类别与事实不符。

### R5 导航与存储在 handler 里直接摸宿主，绕过适配层（中）

按本计划自定原则（"宿主能力一律端口化"+"形状按调用点定"），导航与持久化都属于宿主能力，但 weapp 页面现状是直接调用：

- **导航**：`wx.navigateTo`（详情）、`wx.reLaunch`（tab 切换）、`wx.navigateBack` 散落在各页 handler（`articles.ts:53-55`、`home.ts:25-28`）；没有路由表单一来源，`/pages/home/home` 等路径字面量各页各自维护。H5 侧有 site-routes + `route()` + `NavigationPort` 对等物，weapp 侧三样都没有。
- **存储**：`wx.getStorageSync`/`wx.setStorageSync` 直调（`detail.ts:12,31`、`settings.ts:10,22,24`），没有 `PersistencePort` 适配器。这是 R2 设置值域重复与收藏模型分叉无法收敛的根因——只有存储先走端口，共享的 `normalize`/`parse` 才有落点。
- **代价**：页面栈语义（tab 切换用 `reLaunch` 还是 `switchTab`、直达进入时 `navigateBack` 无栈怎么办）没有集中处，正是 F4 反复与两页行为不一致的来源；handler 不注入 fake 就无法在 node 测试；路径散落使 G4"weapp 自建语义路由"名存实亡。

正确做法（与 R1 同构，不过度抽象）：

1. **路由表**：一个 weapp 路由模块（纯数据/纯函数，页面 id → `/pages/*` 路径），替代散落字面量；这是纯逻辑，不需要端口。
2. **导航适配器**：放 `packages/weapp/mobile-host`，按 weapp 调用点定动词（如 `switchTab(id)`、`openDetail(id)`、`backTo(fallbackId)`），承担栈语义与兜底；**不要照抄 web `NavigationPort`**（`push/current/subscribePopState/referrer/origin` 是浏览器历史栈语义，计划端口约束第 6 条已把它列为已知待审形状）。有真实语义翻译（栈管理、兜底、路径生成）→ 符合"适配器判定：有翻译则留"。
3. **持久化适配器**：`PersistencePort` 形状已按调用点定（字符串读写、`Result`），weapp 实现是薄翻译（同步 API → Promise/Result、异常归一）；接上后设置/收藏的共享模型可随之下沉，连带解 R2。
4. 底层换实现（例如 F4 改原生 tabBar 后用 `wx.switchTab`）时页面不动，只动适配器。

注意：不要在页面里只给 `wx.reLaunch` 包一层同名薄壳——那是无翻译的纯转发，不产生复用；值在于语义动词与路由/兜底的集中。

### R6 小程序构建/检查的门禁覆盖不对称（中）

入口是走了 ops 的，但覆盖有缺口：

- **构建入口**：`ops weapp build/check` 存在（`apps/blog/src/registry.ts:79-91`），实现是 `apps/blog/src/weapp/weapp.ts:14-26` 对 `node apps/weapp/build.mjs` 的 spawn，经 `processStepEffect`（`--dry-run` 可用）。真实构建逻辑（复制 + esbuild + 体积检查）全在 `apps/weapp/build.mjs`，ops 只是薄壳。
- **`ops quality check` 不含 weapp**：`apps/blog/src/quality/quality-check.ts` 全篇无 weapp，lint 路径清单也不含 `apps/weapp`。常规质量门禁只覆盖 H5 与 Rust。
- **`ops package check` 间接覆盖**：它跑 `pnpm run check`（`package-check.ts:39-44`）→ 根 `check = typecheck && pnpm -r run test` → 会执行 `@blog/weapp` 的 `test`（先 build 再 node --test）。两条质量命令覆盖面不对称。
- **类型检查无门禁**：`ops weapp check` 只跑 `build.mjs --check`（文件存在性），不跑 `tsc`；`apps/weapp/package.json` 的 `check` 脚本虽有 `tsc --noEmit`，但 ops 不调用；根 `tsconfig.json` 的 include 也不含 `apps/weapp`。即 weapp 源码类型检查没有任何常规门禁在跑，只有手动 `pnpm --filter @blog/weapp check` 才做。
- **可绕过**：`pnpm --filter @blog/weapp build`、`node apps/weapp/build.mjs`、`pnpm -r test` 都能直接触发构建，不经过 ops 命令。

修法：`ops weapp check` 改为跑 `apps/weapp` 的 `check`（`build.mjs --check && tsc --noEmit`）；把 weapp 的 lint/类型检查并入 `ops quality check`（或明确由 `ops package check` 覆盖并写清语义）；体积检查修正见 F2。

## 四、小程序能力调研与缺口

| 能力 | 作用 | 现状 |
| --- | --- | --- |
| `lazyCodeLoading: "requiredComponents"` + 用时注入 | 启动按需注入 | 未配置 |
| glass-easel 组件框架 | 新组件运行时，Skyline 配套 | 未配置 |
| 分包（独立/预下载/异步化） | 主包减压 | 解决 F2 的正解 |
| 初始渲染缓存（static/dynamic/capture） | 冷启动先画骨架 | 仅 WebView 支持，与全局 Skyline 冲突 |
| DarkMode（`darkmode` + `theme.json`） | 系统深色 | 未配置，可与 F5 一并对齐 |
| 数据预拉取 / 周期性更新 | 微信侧冷启动预取 | 发布后可选（需后台配置） |
| 自定义 tabBar / `page-meta` | 底栏与导航定制 | 修 F4 候选 |
| 体验评分 Audits、性能诊断（3.7.0）、FPS 面板 | 量化验收 | 已列入 P1.4，等开发者工具 |
| Skyline 增强（worklet/手势/共享元素/list-view 等） | 高性能动画与长列表 | 依赖 F3 决策 |
| `enablePassiveEvent`/`handleWebviewPreload`/`networkTimeout` | 滚动/切页/网络低成本优化 | 未配置 |
| WXWebAssembly / Worker | wasm 校验复用等 | 后续按需 |

## 五、修复优先级

**P0（阻碍验收，建议先行）**

1. F2：页面外置共享 `lib/api.cjs`（或分包），体积检查改为统计真实主包全量。
2. R1：weapp 引入薄 `DataResource` 绑定，补取消/竞态/`cancelled` 分支与搜索防抖。
3. F1 + R3：重做正文链接交互（自绘节点或外列链接），补正文样式；下调 RESULT"已提供点击处理"表述。

**P1（计划承诺项）**

4. F3：按 G7 记录渲染器/组件框架决策，或先退 WebView 逐页评估。
5. F4/F5 + R5：weapp 补路由表与导航适配器（语义动词 + 栈兜底）、PersistencePort 适配器；tab 导航改 tabBar 或 `switchTab`；主题/字体跨页生效。
6. F6 + R4：门禁补三方包与"未使用"检查、删 weapp 的 `node:*` 放行、清死代码与未使用依赖。
7. R6：`ops weapp check` 纳入 `tsc`，weapp 的 lint/类型检查并入 `ops quality check`（或明确归属并写入文档）。

**P2（随收尾处理）**

8. R2 重复项（高亮下沉一个 `textSegments`、设置值域下沉 `mobile-foundation`——依赖 R5 的持久化端口落地）；构建产物清理。

## 六、未验证与受限项

- 微信开发者工具/真机不可用，交互结论（链接、tabBar、Skyline 表格兼容）均为文档+源码推断，需在具备宿主后实测。
- 执行流仍在并发改动，本文基于 2026-10-07 工作树快照；修复推进后应对照更新。
- 主包体积结论基于未压缩 JS 合计（约 3.1 MiB，其中页面 JS 约 2.34 MiB），未计开发者工具打包压缩差异；但"每页重复打包 zod"与"检查量错对象"与压缩无关。
