# 页面接入机制决策记录（DECISIONS）

> 状态：2026-10-03 由代理决策（用户委托"结合业界实践自己决策"）；同日 D2/D6/D8 及 CI 检查步骤经用户逐项确认批准（以通俗语言四问四答），全部决策生效。用户可随时推翻，推翻记录须写入本文件。
>
> **2026-10-03 晚间用户推翻性修订（最高优先级，压过下文与之冲突的条目）**：交付形态必须是 **npm 包**——页面抽成包、基建也抽成包（"页面抽成 npm 包，然后这套基建也做出 npm 包"）。此前把"仓内提效"执行成"不做包"是代理对用户意图的误读：用户第一轮选择的选项原文即含"private workspace 包"，中途共识亦明示"先讨论 npm 包/框架这一半"。据此：
>
> 1. **D9 反转**：vite 插件与 page-registry 校验/生成/脚手架机制抽入 `@fluvient-loom/page-build-kit`，宿主只消费；
> 2. **D1 部分反转**：registry 从手写中央文件演进为"从页面包聚合的产物"（自描述 + 聚合，原方向 B；显式可审计靠聚合输出保留）；
> 3. **D6 提前且扩围**：`@fluvient-loom/page-kit`（运行时装配/mount/definePage/页面定义类型）从 P3 提前，与 build-kit 同期抽取；
> 4. **页面 = 包**：框架从第一天按"每页一个包、只声明页面是什么"设计；批量迁移以试点页（desktop-public-detail，用户点名）趟路后推进；
> 5. P1/P2 已交付的机制（校验器/生成器/脚手架）是 build-kit 的核心内容，**搬家进包，不重写**；ops 命令保留为宿主 CLI 的包装。
> 执行计划：PLAN-PAGE-PACKAGING-001。
>
> 以下原文保留作历史记录，冲突条目以上方修订为准。

## 决策总览

| # | 问题 | 决定 | 置信度 |
| --- | --- | --- | --- |
| D1 | 注册方式 | 保留中央注册表，不做目录自描述 | 高 |
| D2 | site-routes.json 手工裂缝 | 改为生成物：codegen + 重新生成比对校验 | 高（待批准） |
| D3 | 校验放哪层 | 单一校验器，三个入口：vite 配置加载期 / `ops page check` / 既有测试 | 高 |
| D4 | platform 死字段 | 不删，改为被校验器消费（强制 outputPath 前缀一致） | 高 |
| D5 | `ops page new` 归属 | 接受开新类别：`ops page` 命令域，check 先行、new 后至 | 高 |
| D6 | kit 边界与形态 | 装配下沉进 `@fluvient-loom/page-kit`（`./mobile`+`./desktop` 子路径，root 仅纯逻辑）；definePage 用两个真实页面验证后才定稿 | 中（待批准） |
| D7 | 命名 | `@fluvient-loom/page-kit`，不叫 devkits | 高 |
| D8 | Desktop 首绘内嵌 | 做，随 D2 的生成器一并落地；修订 SPEC-SITE-ROUTES-001 | 中（待批准） |
| D9 | vite 插件是否下沉进包 | 不下沉；`registrations` 注入接缝保留，出现第二个消费者再动 | 高 |
| D10 | 实施排序 | 校验（P1）→ 脚手架（P2）→ 运行时 kit（P3），与用户既定排序一致 | 高 |
| D11 | 同 URL 双端分流 | 目标模型采"一页多实现"（implementations 映射）；**schema 迁移排 P1 之后**，P1 增加归一化形态接缝；Rust UA 分流另立计划 | 高 |

---

## 设计原则：该重复时重复，该复用时复用（2026-10-03 用户补充，统辖 D5/D6 实施）

判据是代码承载什么，不是长得像不像：

- **声明性代码允许重复**：每行承载该页面/该端自己的信息，重复换来显式、可 grep、改单页不牵连他页。包括：页面入口文件的透传样板（desktop 5 行恒等入口、settings-page 的逐字段透传）、registry 条目本身、两端各自的 StartupError、两端 environment 各自声明的端口集合。
- **机制性代码必须复用**：重复会产生"改一处忘另一处"的分叉风险。包括：校验器、生成器、网络/挂载装配、错误边界、schema。

**业界依据**：Sandi Metz "duplication is cheaper than the wrong abstraction"（错误抽象比重复更贵）；Rule of Three（第三次出现才抽象）。17 条 registry 条目本身就是"声明性重复"的现存范例。

**对决策的修正**：D6 的 definePage 目标从"压短入口"改为"收敛机制"——装配、错误边界、输入契约进 kit；入口里属于该页声明的部分保持明写。desktop 5 行恒等入口**不强行套 definePage**（没有页面逻辑可收敛，套了纯属为抽象而抽象）。脚手架（D5）生成的正是"允许重复"的声明性样板。

**决定**：`pages.registry.ts` 保持唯一登记点，不转向目录自描述（DISCOVERY 方向 B 否决）。

**业界依据**：文件约定路由（Next.js App Router、SvelteKit）面向的是"框架有完整文档体系、海量外部项目接入"的场景；框架内嵌于单仓、消费者是本仓构建链时，主流是中央清单 + 生成物（Rails `config/routes.rb`、Angular 路由模块、Vite/webpack 的 config 中心）。中央表的可审计性（一张表回答"有哪些页面"）对单维护者项目价值更高。

**本仓事实**：registry 已被 4 类消费方读取（INVENTORY §2），全部经同一投影派生，无第二真相；改成自描述要重建 5 组守卫（INVENTORY §6），收益为零。

**代价**：接入动作仍是"改一个中央文件"，由 D5 的脚手架消化。

## D2 site-routes.json 改为生成物

**决定**：写一个 `generate-site-routes`（registry → site-routes.json，纯函数）；canonical alias 取 **`aliases[0]` 约定**（需要时一次性调整 registry 里 alias 的顺序）；校验方式从"测试双向比对"升级为"**重新生成 + 比对**"（generate to string, compare；或写盘后 `git diff --exit-code`）。Rust `include_str!` 路径不变，内容变为生成物。

**业界依据**：手工维护生成物是公认反模式；codegen + `--check`（regenerate-and-diff）是 protobuf（`buf`）、Prisma、OpenAPI、`cargo fmt --check` 的共同纪律——测试只能告诉你"已经错了"，生成器让错误**不可能发生**。Next.js 的 routes-manifest 永远是构建生成的，从不手写。

**本仓事实**：INVENTORY §3 的核心裂缝——`page-routes.json` 自动生成而 `site-routes.json` 手工维护，同一注册表两个投影两种方式；且守卫全部在测试期，CI 发布流不跑测试。canonical 选择今天无机制约束（`/m/` vs `/m` 是人工挑选）。

**代价/影响**：site-routes.json 从"手工源文件"变为"生成物"，SPEC-SITE-ROUTES-001 中"受 git 跟踪、手工维护"的表述需修订（与 D8 一并改）；冻结测试（17/22 有序清单）改为生成比对后自然简化。

## D3 校验：单一校验器、三个入口、构建期 fail fast

**决定**：一个纯函数校验模块（输入 registrations + root，输出错误列表），覆盖：id 唯一、alias 唯一、outputPath 唯一、**alias×outputPath 交叉冲突（新增）**、entry 文件存在、platform↔outputPath 前缀一致（见 D4）、alias/outputPath 格式。三个入口共用同一实现：

1. **vite 配置加载期**（`vite.config.ts` 里 `generatePageInputs` 调用点前）——dev 拒绝启动、build 直接失败；
2. **`ops page check`** 独立命令——CI / 提交前快速跑，不依赖构建；
3. 既有测试守卫保留为执法层（防校验器本身被绕过）。

**业界依据**：Next.js 对冲突路由是构建期硬错误（"Conflicting app and page file"），不是测试期提醒；Vite/webpack 在 config 加载时即校验配置（fail fast）；clippy 与 rustc 共用同一解析器错误——单一实现多入口是标准做法，避免三层各写一套产生分叉。

**本仓事实**：INVENTORY §6——构建期近乎零校验，接入者写错 registry dev 完全不拦；alias×outputPath 交叉冲突全链路缺失；且 registry 消费点本来就在配置加载期（`vite.config.ts:15-16` 带副作用），校验放这里是零结构改动的自然位置。CI 缺口（发布流不跑测试）由入口 2 补：给 build-release workflow 加一步 `ops page check`（workflow 改动列入 D8 的批准包）。

## D4 platform：从死字段变为被消费

**决定**：保留 `platform` 字段，校验器强制 `outputPath` 首段 === platform（`desktop/pages/...` / `mobile/pages/...`）。

**业界依据**：声明了但没有执行者的字段比没有字段更糟（误导读者以为有行为）；把隐式不变式显式化进 schema 校验是标准收敛手段（类比数据库外键固化应用层假设）。

**本仓事实**：INVENTORY §2——platform 今天只被测试读，构建链不消费，实际语义靠 outputPath 前缀隐式传递。强制一致性后，字段、目录布局、架构测试（`source-layout.test.ts` 从目录名推断平台）三者对齐，不再有隐式通道。

## D5 `ops page`：接受新命令域

**决定**：开 `ops page` 命令域：P1 落 `ops page check`（承载 D3 入口 2），P2 落 `ops page new`（生成 registry 条目 + 入口文件 + slice 模板，registry 条目生成后立即过校验器）。不独立成包。

**业界依据**：生成器命令是框架 CLI 的标准类别——`rails generate`、`ng generate`（schematics）、`nest g`；本仓 ops 没有先例是历史空白不是边界禁令。脚手架生成物必须先过校验（生成器与校验器共生）是 Angular schematics 的明确设计。

**本仓事实**：INVENTORY §7——无生成器先例，但 nix wrapper 定位 `apps/blog/src/main.ts` 的机制对新命令域零阻力；registry.ts 的 namespace 结构（`path: ['ns','sub']`）天然容纳 `page` 域。

## D6 kit 边界与形态

**决定**：

1. environment 装配从 `bootstrap/*/environment.tsx` 下沉进新包 `@fluvient-loom/page-kit`（P3 阶段执行）；bootstrap 层瘦身为调用 kit；
2. 导出面：`./mobile` 与 `./desktop` 子路径；**包 root 只放无 UI 纯逻辑**（network 参数工厂、mount 目标解析、site-routes schema/embed helper）；StartupError 等组件按平台留在各自子路径内——两端 UI 隔离边界（AGENTS.md）在包内同样成立；
3. `definePage` 形状按 mobile/detail 提炼的三类（输入解析/依赖创建/返回策略，INVENTORY §5），**必须用第二个真实页面验证后才定稿**（当前全仓只有一个完整样本，单样本定 API 是最大设计风险）；目标是**收敛机制**（装配/错误边界/输入契约），不是消灭入口的声明性样板（见"设计原则"），desktop 5 行恒等入口保持现状；
4. SPEC-ARCH-BOUNDARY-001 随之修订：从"bootstrap 是唯一装配层"改为"**page-kit 是唯一装配点，bootstrap 是唯一调用点**"——装配从 17 处收敛为包内一处，不变式的强度是增加的；source-layout 门禁同步改写执法对象。

**业界依据**：Next/Nuxt 模式——框架拥有运行时装配，页面代码永不触碰适配器接线；`@nuxt/kit` 是"框架能力以包形式暴露、模块作者不碰内部"的直接先例。API 用至少两个消费者验证再冻结是库设计的常规纪律（rule of two / design against real usage）。

**本仓事实**：INVENTORY §4——desktop ⊂ mobile（3/11 字段）、零共享模块（测试明文禁止）、真实共享面仅 4 块逐字重复代码 + 同形 schema；这否决了"共享核心包 + 两端适配包"的三包结构，支持子路径形态。另：`createPage` 抛错两端无人捕获、`route()` 在 StartupError 兜底外（§4 错误路径），下沉时一并在 kit 内收敛错误边界——这是装配收敛带来的真实收益，不是挪代码好看。

**代价**：SPEC 修订 + source-layout 门禁改写；这是全部决策里可逆性最低的一项，故排 P3 最后执行。

## D7 命名

**决定**：`@fluvient-loom/page-kit`。理由不变：对齐 `@fluvient-cli/cli-kit` 惯例；mount/装配是运行时能力，devkit 语义偏向开发期工具，脚手架已按 D5 归入 ops 命令，名字里不再预留。

## D8 Desktop 首绘内嵌

**决定**：做。Desktop environment 改为与 Mobile 同构的内嵌清单（同一份生成物，同一 schema 校验）；运行时 `/api/public/site-routes` 端点**保留**（作为对外契约与第三方消费面，不删）；SPEC-SITE-ROUTES-001 修订为"registry 是事实源，两端构建期内嵌，运行时端点为兼容/外部消费保留"；schema 守卫测试从只点名 mobile id 扩为全部 id。随 D2 生成器一并落地（P1 内的可选项，因为内嵌的前提就是"清单是生成物"）。

**业界依据**：构建期已知的数据不应放在网络跳之后（Next 把 routes manifest 内嵌进 server runtime 而非启动时请求）；Mobile 已在本仓验证过同一解法（弱网切换耗时 -71%，PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001）。

**本仓事实**：INVENTORY §8——技术条件全部具备（schema 两端逐字相同、import 可达、Vite JSON import 已验证），唯一卡点是 Spec 把运行时下发定为默认契约，属契约修订而非技术工作。

## D9 vite 插件不下沉

**决定**：`page-template`/`page-bootstrap`/`page-routes`/`mobile-prefetch` 留在 `src/frontend/vite-plugins/`，不进包；`registrations` 参数注入接缝保留。触发重新评估的条件：出现第二个消费者（另一个仓/应用接入）。

**业界依据**：抽取公共模块的门槛是"第二个消费者真实存在"（rule of three 的保守版）；为想象中的复用提前抽象是反模式。

**本仓事实**：INVENTORY §1——注入接缝存在但装配点从未使用；单消费者下抽包零收益，还要处理硬编码项（settings.tsx 入口、.generated 布局、zh-CN/theme-color 模板常量）的参数化成本。

## D10 实施排序

P1 校验与生成（D2+D3+D4+D8+`ops page check`+CI 步骤）→ P2 脚手架（D5 的 `ops page new`）→ P3 运行时 kit（D6+D7）。与用户既定"先校验、再脚手架、最后运行时"一致；每阶段独立可验收，P3 失败不回滚 P1/P2。

## D11 同 URL 双端分流：目标模型与时机（2026-10-03 补录）

**需求**（用户提出）：同一对外 URL 对 mobile/desktop 构建期各产出一份 HTML，服务端按 User-Agent 分流（业界称"动态服务"，Google 三配置之一；另两种是响应式与独立 m. 站点，均不适用）。

**决定**：

1. **目标模型采"一页多实现"**，经用户两轮修正（2026-10-03）定型为**三层分离，身份轴是 variant 而非 platform**：

   - **数据层（开放）**：`implementations: ReadonlyArray<{ variant, outputPath, entry, meta? }>`——`variant` 是**开放 key、页面内唯一**（desktop/mobile/ssr/exp-b/zh/…），策略层的选择目标；每份可带 `meta` 标注；
   - **platform 不进 schema**：它是派生事实——校验器从 entry 路径（bootstrap/<platform>/）与 outputPath 首段推导平台世界并校验同一实现内两者一致。变体轴不是 platform：今天 variant 恰好叫 desktop/mobile 是命名约定（与 UA 策略对齐），非结构承诺——同平台多变体（A/B、ssr/csr）由此天然可表达。（注：INVENTORY §2 早已发现 platform 字段是构建链死字段，本模型让它彻底离开 schema；D4 的 platform↔outputPath 校验随之改写为"实现级 entry/outputPath 平台世界一致性"的派生校验。）
   - **策略层（独立可替换）**：`select(request, implementations) → variant` 独立于登记表存在；默认 UA 粗分 → 选约定名 "mobile"/"desktop"、未知兜底 desktop；将来 cookie/地域/实验/复杂脚本分流只换策略函数，schema 与构建链不动。

   site-routes 保持 1 id : 1 URL（D2 几乎不动）；`route()` 语义不裂。P1 归一化形态调整为 `{pageId, variant, outputPath, entry}` 扁平列表（variant 取代 platform 占位）。选项 B（两条记录同 URL）否决，其真实破坏点为：alias 唯一性测试（重复 URL 字符串必撞）、后端启动期拒载重复 alias（`static_files.rs:64-69` → 500）、dev `pageRouteMap` 键静默覆盖。（注：问题陈述 §2.3 所称"撞 outputPath 唯一性"不成立，mobile/desktop 前缀天然不同——已在本文档纠正。）
2. **schema 迁移排 P1 之后，无论需求急缓**。P1 的校验器/生成器/执法测试正是 17 条记录 + 6 组守卫 + 4 个插件消费方迁移所需的安全网；先迁 schema 再建网是倒序。问题陈述 §4.6"当前要做则不启动 P1"的建议据此否决。
3. **P1 增加一条要求（D11 的接缝）**：校验器/生成器内部消费归一化形态（`{ pageId, platform, outputPath, entry, ... }` 扁平列表），registry schema 仅是其上游适配层。D11 落地时只改适配层，校验器/生成器/`ops page check` 不动。
4. **Rust UA 分流另立计划**，含：`static_files.rs` UA 感知与实现选择（依赖 D11 投影的扩展）、**`Vary: User-Agent` 响应头（必须项，否则缓存层串页）**、dev 中间件（`page-routes.ts`）UA 感知、移动优先索引下 mobile HTML 完整元数据的验收项。
5. **触发条件**：出现第一个真实的双端同 URL 页面时启动 D11 执行计划；该页面同时充当 D6.3 的 definePage 第二验证样本（比 mobile/detail 更复杂的样本反而更好）。未触发前 D11 停在本记录，P1/P2/P3 照常。

---

## 待用户批准清单（触及 Spec/边界/CI）

2026-10-03 用户逐项批准完毕，以下记录原批准项与批准内容：

1. **D2 已批准**：site-routes.json 转生成物（修订 SPEC-SITE-ROUTES-001 的来源描述）；
2. **D6.4 已批准**：SPEC-ARCH-BOUNDARY-001 修订 + source-layout 门禁改写；
3. **D8 已批准**：SPEC-SITE-ROUTES-001 契约反转（内嵌为默认、端点保留）；
4. **CI 步骤已批准**：build-release workflow 加 `ops page check` 步骤（原与 D8 捆绑提问，拆为独立一项确认）。

全部决策（D1–D10 及 CI 步骤）生效，可进入派生实现 Plan 环节。
