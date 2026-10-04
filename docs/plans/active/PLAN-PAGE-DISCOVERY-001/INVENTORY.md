# 页面接入机制现状清单（INVENTORY）

> 状态：探查事实汇总，2026-10-03 三路只读探查合并，供本计划讨论使用；不是 Spec。
> 读法：未标注的均为**事实**（附路径:行号）；**[推断]** 为探查中标注的推断；**[没有]** 为源码中明确不存在的东西。
> 行号反映 2026-10-03 工作区状态（含进行中的 PLAN-MOBILE-PERSISTED-STATE-001 第二阶段未提交改动，尤其 detail 链路）。

## 1. 构建期插件的真实耦合度（开放问题 1）

四个插件的耦合度 spectrum：`page-routes` 零仓库耦合 → `page-template`/`page-bootstrap` 默认参数直连 registry → `mobile-prefetch` 不碰 registry 但硬编码路径。

| 插件 | 仓库 import | registry 依赖 | 硬编码假设 |
| --- | --- | --- | --- |
| `page-routes.ts` | **无**（仅 `import type { Plugin } from "vite"`，:1） | 无默认值；唯一输入 `routes: ReadonlyMap<string,string>` 构造参数 | 隐式：传入 Map 的 value 须为 `.generated/pages/...` 形态的 dev 可服务路径 |
| `page-template.ts` | 直连 `../pages.registry.ts`（:11-16） | `registrations = pageRegistry` 默认参数（:66、:82、:97） | `.generated/pages` 目录布局（:18）；HTML 模板常量：`lang="zh-CN"`（:41）、`theme-color #f4f1ea`（:45）、`<div id="app">`（:50） |
| `page-bootstrap.ts` | 直连 `../pages.registry.ts`（:3）+ `./page-template.ts` 的 `generatedPagePath`（:4） | 同上默认参数（:48）；消费 `page.bootstrap` 字段（:53） | **内联引导脚本入口硬编码 `bootstrap/mobile/settings.tsx`**（:24） |
| `mobile-prefetch.ts` | 无 registry 依赖 | 不接收 registrations | SW 入口硬编码 `sw/mobile-prefetch.ts`（:16）；SW 本体硬编码 `/api/public/mobile/category-shelf` 前缀（`sw/mobile-prefetch.ts:4`） |

关键事实：

- **"注入自己的 registrations"这条路存在但无人使用**：`vite.config.ts:20-21` 装配 `pageTemplatePlugin()` / `pageBootstrap(root)` 均不传参，走默认 `pageRegistry`；唯一显式传数据的是 `pageRoutesPlugin(routes)`（:23）。
- **registry 消费发生在配置加载期且带副作用**：`generatePageInputs(root)`（`vite.config.ts:16`）在 vite 读配置时就 `rmSync` 并重写源码树里的 `.generated/pages/**`（`page-template.ts:64-79`）——dev 启动与每次 build 都执行。
- `page-template.ts` 读取的字段全集：`outputPath/entry/title/description/shell/id` + aliases 经 `pageRoutes()`（`pages.registry.ts:229-235`）。
- `shell` 字段类型耦合 workspace 包 `@fluvient-loom/app-shell` 的 `AppShellSpec`（`page-template.ts:9`）。

## 2. PageRegistration 逐字段：消费面分类（开放问题 2）

字段定义 `pages.registry.ts:32-42`。"框架契约"按消费方数量划分：

| 字段 | 消费方 | 分类 |
| --- | --- | --- |
| `id` | 构建输入 key（`page-template.ts:76`）、site-routes.json 键、前端运行时 `route()` 全仓 46 处调用、Rust href 构造（`site_routes.rs:69,76`）、多组测试 | **多方消费——框架契约** |
| `outputPath` | HTML 生成（:61）、dev 重写表（:87）、build 重命名（:120-127）、page-routes.json、后端静态服务（`static_files.rs:30-72`）、测试 | **多方——框架契约** |
| `aliases` | dev 重写表、page-routes.json、site-routes.json 取值、测试冻结清单 | **多方——框架契约** |
| `entry` | HTML `<script src>`（:51）+ 测试读盘断言（`page-template.test.ts:205-221`）；不进任何产物 JSON | **框架契约**（消费方少但不可缺） |
| `title` | 仅 `page-template.ts:46` 渲染 + 测试（禁英词 Blog/Admin/Article 等，`page-template.test.ts:151-154`） | 字段是契约；**值是本仓库私有** |
| `description` | 仅 `page-template.ts:30-32`；**当前 17 条全部 `undefined`，该分支从不触发 [推断]** | 同上，且是死配置 |
| `bootstrap` | 仅 `page-bootstrap.ts:53` + 其测试；构建期唯一用途 | 单消费方——**本仓库增强项** |
| `shell` | 仅 `page-template.ts:33-38` + 测试；仅 mobile-article-detail 一条（`pages.registry.ts:197`） | 单消费方——本仓库增强项 |
| `platform` | **没有任何 vite-plugin 或运行时代码读取它**；唯一消费点是测试（`page-template.test.ts:218`）。platform 实际通过 outputPath 首段（`desktop/...`/`mobile/...`）隐式传递 [推断：架构测试从目录名推断 platform，`source-layout.test.ts:74-87`] | **形式字段——声明了但构建链不消费** |

## 3. 投影链路：有没有现成接缝（开放问题 3）

**结论：registry → 构建产物这条边有接缝（`registrations` 参数）；registry → site-routes.json 这条边完全没有接缝——它没有生成器。**

- `site-routes.json` 是 **git 跟踪的手工维护文件**（commit 7f9070d 一次性引入），全仓无任何写它的脚本/命令/构建步骤 [事实：全仓 grep 含 .mjs/.yml/.nix/.sh 无命中]。"幂等"概念不适用（无生成器）。
- 它与 registry 的同步**完全靠测试守卫**（`page-template.test.ts`）：
  - 键集合 == registry id 集合的**双向校验**（:99-102，非快照比对）；
  - 每个值必须是该页已注册 alias（:103-110）；多 alias 时选哪个（canonical）**自由，无机制约束**；
  - 17 页 / 22 alias 的**冻结计数 + 有序清单**（:37-78、:81、:88）。
- 产物侧的 `page-routes.json`（alias→outputPath）则由构建**自动生成**（`page-template.ts:105-110`）——即存在**两张表、两种维护方式**：产物表自动、运行时清单手工。
- Rust 侧 `include_str!("../../../frontend/site-routes.json")`（`site_routes.rs:14`）硬编码仓库相对路径。
- "改了 registry 忘了同步"的拦截矩阵：新增/删页面 → 计数+键集合失败；改 alias → 成员校验失败；改 id → 键集合失败，涉 Rust 引用的 id 则 cargo test 失败。**但拦截全部发生在测试期**；CI 的 build-release workflow 只跑 `ops delivery package`（build+zigbuild），不跑测试套件 [推断成分极小：由 workflow 步骤与 deploy-plan.ts:51-77 组合得出]。
- `definePage` 现状：**[没有]**——不存在任何 definePage 或等价抽象；入口样板分析见 §5。

## 4. 运行时装配：mobile/desktop 实际共享面（开放问题 4）

**结论：desktop 是 mobile 的严格子集。零互相 import、零共享模块（source-layout 测试明文禁止跨平台引用，`source-layout.test.ts:146-152`）。真实共享面只有 4 块逐字重复代码 + 同形 schema。**

| 维度 | mobile（`bootstrap/mobile/environment.tsx`，208 行） | desktop（`bootstrap/desktop/environment.tsx`，66 行） |
| --- | --- | --- |
| context 字段 | 11 个（`mobile/foundation/context.ts:18-30`） | 3 个（api/routes/navigation，`desktop/foundation/context.ts:4-8`） |
| desktop 独有项 | — | **没有**（desktop 所有项 mobile 均有对应物） |
| routes 获取 | 构建期内嵌 JSON + zod（:25、:74-91），context 创建**同步** | `await api.siteRoutes.get().start()`（:29），**async** |
| 逐字重复代码 | network 参数（mobile :28-32 / desktop :23-27）、navigation 参数（:33-37/:13-17）、StartupError（:103-112/:42-51）、mount 守卫（:117-118/:56-57）——四块均为独立拷贝 | 同左 |
| SW / app shell / prefetch | 有（:127、:130-135、:137-174） | 无 |

对 kit 形态的直接含义：可共享量撑不起独立共享层——**子路径导出（`./mobile`、`./desktop`）+ 少量共享纯函数**是现状证据支持的方向；"共享核心包 + 两端适配包"的三包结构缺乏事实支撑。

**错误路径现状**（对"先校验"排序的输入）：

- `createPage` 抛错两端均无人捕获：mobile 为未捕获异常（`environment.tsx:125` 无 try/catch）、desktop 为 unhandled rejection（`:58` `void ...then` 无 catch）→ 页面空白 [推断：由控制流得出]；
- `route()` 找不到 id 即 throw（`mobile/foundation/context.ts:32-38`），调用发生在 StartupError 兜底**之外**；
- 入口脚本加载失败**[没有]**任何兜底（无 onerror）；mobile detail 页此情形 app shell 骨架将永久停留 [推断：shell CSS 持续隐藏 `#app`，`app-shell/src/shell.ts:190`，且仅 `removeMobileAppShell` 移除]。

## 5. 页面入口样板（开放问题 3 的 definePage 素材）

| 入口 | 行数 | 样板占比 | 输入解析 | 依赖创建 | 返回策略 |
| --- | --- | --- | --- | --- | --- |
| `bootstrap/desktop/home.tsx`（detail 同构） | 5 | 100%（恒等透传） | 无（desktop detail 在页面组件内做，`desktop/pages/detail/page.tsx:14`） | 无 | 无（静态链接） |
| `bootstrap/mobile/settings-page.tsx` | 17 | 100%（逐字段透传，:7-15） | 无 | 无 | 无 |
| `bootstrap/mobile/detail.tsx` | 38 | 约 60% | 有（:17 id 解析） | 有（:13 favorites store，进行中工作新增） | 有（:20-35 referrer/history 判定） |

- **全仓库只有一个入口三类俱全**（mobile/detail）——`definePage` 的字段归纳（输入解析/依赖创建/返回策略）在现状里有且仅有一个完整样本。
- 样板的编译期防线：页面输入接口约束漏传（`mobile/pages/settings/page.tsx:28-37` 全 9 字段必填）；测试强制入口形态（`mountMobilePage(...)` 存在、禁直接 `getElementById`/import solid-js/web，`page-template.test.ts:205-221`）、CSS import 恰好一次（:224-229）。
- **手写 HTML 被测试禁止**（`page-template.test.ts:179-202`）：frontend 源码树不得存在任何 .html——生成器已是唯一 HTML 来源。

## 6. 校验现状矩阵（开放问题 5）

**结论：构建期几乎没有校验（唯一一个是产物存在性）；校验集中在测试期；后端启动期兜底 alias 重复。**

| 校验项 | 构建期（dev/build） | 测试期 | 后端启动期 |
| --- | --- | --- | --- |
| entry 文件存在性 | **[没有]** 显式检查；build 靠 vite 解析 script src 失败 [推断] | `readFileSync(entry)`（`page-template.test.ts:205-207`） | — |
| id 唯一 | **[没有]**；重复 id 静默覆盖 inputs 键 [推断：对象赋值语义] | `:86` | — |
| alias 重复 | **[没有]** | `:88`（Set 尺寸） | `static_files.rs:64-69` 拒绝加载 → 500（`:117-120`） |
| alias × outputPath 交叉冲突 | **[没有]** | **[没有]**（全仓无此检查） | **[没有]** |
| outputPath 唯一 | **[没有]** | `:87` | 不校验唯一（**故意**允许多 alias 同 outputPath，`static_files.rs:221-222`）；只校验格式/遍历（`:55-63`） |
| slice 目录结构 | — | `source-layout.test.ts:178-207`（目录白名单）、:120-176（依赖方向） | — |
| 手写 HTML 禁止 | — | `:179-202` | — |

执行时机矩阵：

- **dev**：零 registry 校验 + URL 重写（`page-routes.ts:6-15`）；
- **build**：仅产物存在性检查（`page-template.ts:122-126`）；
- **测试期**：全套守卫，经 `pnpm -C src/frontend run test:frontend` / `test:core` 或 `ops quality check`（`quality-check.ts:31`）；注意 `src/frontend` 无 `test` script，根 `pnpm test` 递归**不会**跑到它；
- **CI**：build-release workflow 不跑测试套件 [推断成分极小]。

## 7. ops 命令域（开放问题 6）

- 18 条命令（`apps/blog/src/registry.ts:61-208`）全部为**执行/检查类**（runtime 编排、quality 门禁、delivery 打包、release 打 tag、admin/content 运维）；**[没有]** 生成器/脚手架先例。
- 最接近的先例只写单文件：`admin credentials init`（写 credentials.env）、`delivery installer`（产单文件 mjs）。
- **结论：`ops page new` 是给 ops 开新类别，不是"对齐"现有组织**——此前 PAGE-KIT.md §5.3 的默认推荐理由（"对齐现有命令域组织"）与事实不符，闸门讨论需按新类别评估。
- nix 侧无障碍：ops wrapper 从 workspace root 逐级定位 `apps/blog/src/main.ts` 执行（`nix/flake.nix:16-48`），新命令域只动 registry.ts。

## 8. Desktop 首绘内嵌（开放问题 7）

- 现状：Desktop 每页首次挂载被 `api.siteRoutes.get()` 阻塞（`desktop/environment.tsx:29`），失败渲染 StartupError，无内容先绘。
- Mobile 解法（内嵌 JSON + zod）的全部技术条件 Desktop 均已具备：同层 import 路径可达 [推断]、schema 两端逐字相同（`desktop/foundation/api/types.ts:56-58` ≡ `mobile/.../types.ts:124-127`）、Vite JSON import 已被 Mobile 验证。
- **卡点不是技术，是契约**：`SPEC-SITE-ROUTES-001:13` 以运行时下发为默认契约，Mobile 内嵌是例外；Desktop 切换 = 修订该 Spec。另守卫测试目前只点名 mobile id（`page-template.test.ts:121-128`），需同步扩展。
- 切换原因为何至今未做：**文档未记录** [事实：RESULT.md L18 只陈述"desktop 仍使用"，无理由；APP-SHELL 计划全文无相关说明]。

## 9. 对 7 个开放问题的速查回答

| # | 问题 | 一句话答案 |
| --- | --- | --- |
| 1 | 插件耦合度 | 一个零耦合（page-routes）、两个默认参数直连 registry 且硬编码 settings.tsx/.generated 布局、一个不碰 registry 但硬编码 SW 路径；`registrations` 注入接缝存在但装配点从未使用 |
| 2 | 字段契约 | id/outputPath/aliases/entry 是框架契约；title 值私有；description 死配置；bootstrap/shell 单消费方增强项；**platform 声明了但构建链不读** |
| 3 | definePage→registry→site-routes 接缝 | 前半条有接缝（参数注入）；**site-routes.json 无生成器，纯手工 + 测试守卫**；definePage 不存在 |
| 4 | environment 共享面 | desktop ⊂ mobile（3/11 字段）；零共享模块（测试禁止）；真实共享面 = 4 块逐字重复代码 + 同形 schema |
| 5 | 校验现状 | 构建期近乎为零；测试期全覆盖守卫；alias×outputPath 交叉冲突全链路 [没有]；CI 不跑测试 |
| 6 | ops page new | 新类别，无先例；此前"对齐"的说法与事实不符 |
| 7 | Desktop 内嵌 | 技术无卡点，卡在 SPEC-SITE-ROUTES-001 契约修订 + 守卫扩展；历史原因未记录 |
