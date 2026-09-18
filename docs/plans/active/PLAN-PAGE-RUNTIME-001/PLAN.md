---
kind: plan
id: PLAN-PAGE-RUNTIME-001
status: ready
owner: project-manager
created: 2026-09-11
last_reviewed: 2026-09-11
---

# 页面运行时与 App Shell（@fluvient-loom/container · page · web · solid）

## 定位与范围裁定

2026-09-11 用户裁定一拆为二：**数据内核三包（common / query / command）拆出为 `PLAN-LOOM-DATA-001`**（本计划的前置依赖）；本计划聚焦**页面运行时**——导航栈、状态快照、保活池、App Shell——以 `@fluvient-loom` 系列包生长。

- **D7（沿用）**：做包不发布（workspace 私有）、不接入业务（blog 接入另立项）；
- 工程设施（root workspace、`tsx --test`、`ops package check`、源码直出）由 `PLAN-LOOM-DATA-001` 建立，本计划沿用不重造；
- 本计划的包只消费 `PLAN-LOOM-DATA-001` 三包与彼此，不重造数据内核能力。

目标：在 Web 标准之上构建页面运行时内核，让 C Mobile 获得类原生 App 的导航体验；同时保留 MPA 的每页 HTML 入口作为分享 / 深链 / 无 JS 的兜底形态（接入期落地）。

定位边界（不是什么）：不是 UI 框架（响应式与组件模型归 Solid）、不是路由库或状态库、不重造平台正在补的能力（转场骑 View Transitions、浮层骑 `<dialog>`/popover、预取关注 Speculation Rules、导航事件关注 Navigation API）。

## 包图景

| 包 | 内容 | 依赖 |
| --- | --- | --- |
| `@fluvient-loom/container` | 导航脊柱：栈 ≡ 日志折叠三规则、槽 / form（D5）、导航事务 begin/commit/settle、HistoryPort、页作用域 port 挂起、保活池 | 三数据包 |
| `@fluvient-loom/web` | browser 适配器：history / localStorage / document / scheduler 端口实现 + playground（可点 demo 在此回归） | container |
| `@fluvient-loom/page` | 页面模块契约：definePage、PageContext、快照打包、生命周期词汇表 | container |
| `@fluvient-loom/solid` | SolidViewAdapter（R0 审定后动工） | container、page |

## 工作流（排期待 PLAN-LOOM-DATA-001 交付后细化）

| 期 | 内容 | 依赖 |
| --- | --- | --- |
| container 期 | 导航脊柱平台中立内核：帧号/快照三规则、槽/form、导航事务、页作用域挂起接口；**涉及 ViewAdapter 交互面的部分以 R0 审定为准** | PLAN-LOOM-DATA-001 |
| web 期 | browser 端口实现 + playground demo（列表→详情→返回原样等核心场景可点） | container 期 |
| page / solid 期 | definePage 契约 + SolidViewAdapter（**R0 五条拍板后动工**，工程大头预算在此） | container 期 |
| 保活池期 | tab 根常驻 + LRU-K + 入池打包 / pagehide 全池刷新 + 策略参数 | solid 期 |
| 选修包 | 深链造栈、导航预取、数据 loader、tab history 性格题、多级 pop | 按需 |
| blog 接入 | **另立项**：settings/articles/detail 接入、三 bug 收账、kernel 双源切并、`test:core` 合并、MPA 兜底回归 | 各期 |

## 验收（包级；blog 侧验收归接入计划）

1. playground demo 核心场景跑绿：列表→详情返回，筛选 / 滚动 / 数据原样（快照路）；刷新恢复帧与快照；sheet 筛选 back 关 sheet 且草稿保留；
2. 保活池期：池命中 pop 为 0 渲染（DOM 原位，无白闪）；池中页面挂起（无后台流量/CPU）；逐出后走快照路不丢状态；
3. 平台中立护栏持续全绿（container/page 包 `src/` 零 node/web/solid import；web/solid 包按各自定位豁免）。

## 约束与依据（现状事实，为接入期设计输入，本计划写集不触）

事实（`docs/FACTS.md` 与代码现状）：

- `src/frontend/pages.registry.ts` 是页面单一事实源：platform / entry / aliases / `bootstrap` 标志位；HTML 全部由生成器产出，无手写模板；
- `src/frontend/build/page-bootstrap.ts` 已实现 head 内联 IIFE 机制：入口源码打成经典 script 同步注入每个 `bootstrap: true` 的 mobile 页面，在 CSS 生效前写 `data-theme`/`data-font`；`SPEC-MOBILE-THEME-SETTINGS-001` 要求该脚本由同一套 Data 源码装配，禁止手写第二份存储规则；
- 现状是 MPA：`Link` 渲染真 `<a>`，无客户端路由；`environment.tsx` 的 `createBrowserMobileContext` await site-routes 取回后才 render（JS 下载 → 路由请求 → 渲染串行）；
- `app/habitat/mobile/pages/settings.tsx` 已知三问题（接入期直接输入）：
  1. 主题投影有两个写入者、两种机制（head IIFE 裸 `setAttribute` 管启动，页面 mutation `onState` 管变更）；
  2. `mutation.state()` 读 kernel 闭包变量而非 signal → `<Show when={...status === "error"}>` 永不重算，保存失败横幅与重试按钮是死代码；
  3. 页私有逻辑放在共享 `logic/` 目录，违反页面内聚约定；
- 现有测试缺口：bootstrap 集成测试只喂 legacy key 并用 legacy 读取函数断言；页面装配层无测试（上述响应式 bug 因此存活）。

架构决策（2026-09-11 讨论拍板）：

| # | 决策 |
| --- | --- |
| D1 | 抽象生命周期（restore→reconcile→mutate→project）做成 kernel 通用工厂，不下放 habitat（→ `PLAN-LOOM-DATA-001` W3 交付） |
| D2 | 导航演进方向 = App Shell + 页面模块；HTML 入口降级为对外分享形态，双形态挂载长期保留 |
| D3 | 页面模块内聚：一页一目录、有且仅有一个入口；页私有代码全在目录内，共享组件留在外 |
| D4 | LRU-K 保活池是主要体验目标；快照仍是地基，池是快照之上的缓存加速器 |
| D5 | Modal/BottomSheet = 页面的一种形态（进栈、可套页）；toast/tip = 瞬态层（不进栈） |
| D6 | URL 文法 = 叶子寻址 + registry 静态父图，URL 空间零变更 |

## 架构共识（一）：本体与分层

内核建模五件事（所有场景不变）：

| 模型 | 回答 | 落点 |
| --- | --- | --- |
| 页面模型 | 页面是什么（身份/路径/状态归属） | page 包 + pages.registry |
| 导航模型 | 页面怎么来去 | container 包（NavigationPort 长大） |
| 生命周期模型 | 页面怎么活（快照/恢复/销毁） | container + page（desired-state dispose 纪律承自数据包） |
| 资源模型 | 页面怎么准备（预取/缓存/失效） | query 包（PLAN-LOOM-DATA-001） |
| 状态作用域 | 状态归谁管 | command 包工厂 + 状态分层表 |

**导航是唯一的动词**：生命周期是导航的后效（快照/恢复/销毁），资源准备是导航的前效（预测/预取/去重）。接口形状围绕导航事务组织：`begin`（拦截/预取检查）→ `commit`（快照旧的、挂载新的、投影 history）→ `settle`（revalidate、恢复焦点/滚动）。四个模型不各暴露一套接口，各自挂到事务三阶段上。

变化的不是一层，是三道缝：

```
内核（五件事 + 导航事务，永不变）
  → 端口（能力适配：HistoryPort / StoragePort / ViewAdapter —— 平级，都是插进内核的）
  → 策略（构造参数：保活上限 K、预取激进度、快照配额 —— 不是适配器，不 fork 内核）
  → 形态（组合：单栏 / 双栏 / 多标签 shell）
```

依赖方向铁律：ViewAdapter 与 HistoryPort 平级，内核对 Solid 一无所知（如同对 localStorage 一无所知）；内核依赖的是 ports，不是"Web 标准"——Web 标准本身是第一个适配环境（web 包）。

状态分层归属（快照机制的护城河）：

| 状态域 | 归属 | 生命周期 |
| --- | --- | --- |
| 页面状态（表单草稿、滚动） | 生命周期模型 | 随导航快照/恢复 |
| 资源状态（接口缓存） | 资源模型 | 按失效策略 |
| 会话状态（theme、auth） | 状态作用域（command 包工厂） | 跨页面，永不进导航快照 |
| 视图状态 | 适配层（Solid 组件） | 随组件实例 |

反例即起点：theme 若被当页面状态存进 settings 页快照，pop 会用旧值覆盖别处的新值——作用域错了，快照就是 bug 工厂。

## 架构共识（二）：会话状态与投影归一（内核侧归 PLAN-LOOM-DATA-001，web 消费归接入期）

kernel 通用工厂（`createPersistentDesiredState`）：组装——`PersistencePort` 同步 restore、DataTask 异步 reconcile、`createDesiredStateMutation`（乐观/回滚/重试）、**`project(state)` 唯一投影钩子**（restore / reconcile / 乐观更新 / 回滚 / 重试全路径都经过它）。kernel 不 import solid；signal 镜像留在消费侧。

web 侧两处消费（接入期落地，设计先行记录）：

1. **head IIFE**（启动投影）：page-bootstrap 入口源码改调工厂，消灭裸 `setAttribute` 的第二套写法，两写者归一；IIFE 只需 restore→project 切面，完整工厂与最小切面的 API 形状（单工厂可选配置 vs 两层导出）在接入期实施时定；
2. **settings 页**：mutation 从页面级升 app 级，页面降级纯 UI（读 signal、调 update、渲染错误横幅）——顺带修死横幅（mutation 状态镜像进 signal）。

页面模块内聚（D3，接入期落地）：

```
app/habitat/mobile/pages/settings/
  index.tsx      ← 有且仅有的入口（页面工厂）
  logic.ts       ← 现 logic/settings.ts 整体搬入（页私有）
```

共享 `ui/`、`components/`、`shared.tsx`（MobileShell）留在页目录之外。

## 架构共识（三）：导航模型——栈 ≡ 日志的折叠（container 期）

核心形式化：浏览器 history 是线性导航日志；栈不是另一个数据结构，而是日志的语义折叠。全部地基只有三条规则：

1. **URL 只指栈顶**：寻址参数（`id`、`cat`——决定内容，发给别人有意义）进 URL；丰度参数（滚动、草稿——只决定样子）不进；
2. **历史条目贴帧号**：压栈 `pushState({frame: n}, '', url)`，帧号自增，同 URL 多实例天然可分；
3. **快照按帧号存 sessionStorage**：页面被盖住前打包家当，按帧号入柜。

三层寻址、三种存活期：

| 层 | 载体 | 存活期 | 回答 |
| --- | --- | --- | --- |
| 地址 | URL | 跨会话/跨设备 | 这是什么内容（语义栈） |
| 帧身份 | `history.state` | 会话内，刷新存活 | 这是哪个实例 |
| 快照 | sessionStorage | 刷新存活，关标签即失 | 它当时长什么样 |

推论（全部免费）：刷新 = 三层俱在，按帧号恢复与 pop 同一段逻辑；分享 = 只剩地址层，沿 registry 父图重建"同层级、全新状态"；replace = 换新帧号废弃旧快照。

URL 文法（D6）：叶子寻址 + registry 静态父图。registry 加两列（`parent`、寻址参数 schema）即可表达全部可重建层级；URL 空间、服务端别名规则、生成器、IIFE 零变更。深链造栈（冷进入时 `replaceState(祖先帧)` + `pushState(叶子帧)` + 幂等标记，让返回不出站）为选修。

槽（slot）——form 是组合指令，不是样式字段：

```
form: "page"    → 渲染进【当前槽】，盖住槽内前一任（前一任入池隐藏）
form: "sheet"   → 在上面【开新槽】，下面的槽保持渲染（变暗、inert）
form: "modal"   → 同上，居中
```

pop 补一条：弹到槽的开启者时，关的是槽本身。由此 sheet 内可继续推页、sheet 上可叠 modal——全是三条规则的递归，无特判；"栈的树"是按槽边界折叠日志的派生视图，不是第二真相源。焦点圈/背景 inert 由适配层骑 `<dialog>` 实现。

tab：路径即 tab（`/m/`、`/m/articles`、`/m/settings` 别名白送 tab 身份）；每 tab 一栈（Ionic 先例），tab 根常驻保活池；切 tab 默认 replace 不加日志——写不写 history 是产品性格题，见未决项。

## 架构共识（四）：快照地基 + LRU-K 保活池（保活池期；D4）

保活只覆盖"会话内 pop"一个时刻，刷新/分享/深链无论如何都需要快照三条规则；且内存上限下的逐出会让任何保活方案在边界上退化成快照。**结论：快照是地基，池是快照之上的缓存加速器**——pop 时先查池（0 渲染、DOM 像素级原位），未命中走快照路（1 次渲染），都没有则全新挂载；新旧数据的 revalidate 逻辑只有一份。

池的设计不变量：

- **入池即打包**：被盖住 → 先写快照 → 进池；逐出 = 直接销毁（快照早已在）。池永远只是加速器，不是第二真相源；
- 池中页面 in-flight 结算走 write-through 更新快照；`pagehide` 时全池刷新打包（保刷新恢复最新）；
- **暂停机制做进基础设施，税交一次**：每页拿到的 scheduler / resource / mutation 都是页作用域的，运行时统一挂起/恢复，页面代码无感（对比 Ionic 把暂停税摊给每页 `ionViewWillEnter` 手工重置的散装做法）；
- 策略形状：tab 根常驻（3 页，有界，覆盖 90% 返回场景）+ 近栈距 LRU-K（K 为策略参数：移动 2–3，桌面 8–10）。纯 LRU 的坑：深链连环点会先把列表页挤出去，故根页钉住；
- 池的 key 是帧号不是页面 id（同页两实例两份条目）；
- 池天然吸收"转场双活窗口"——池内页本来就是活的，转场无需特殊安排。

## 架构共识（五）：Modal 是页面，Tip 是瞬态层（D5）

判据两个测试：返回键测试（按返回应该关掉它吗）+ 刷新测试（刷新后它应该回来吗）。

- Modal / BottomSheet / 引导流程：两测皆"是" → 是 `form: sheet/modal` 的页面。表单草稿照常快照、照常入池（高频开关的筛选 sheet 是池最大受益者）、可选编址（哪天需要 `?share=1` 再给）。LayerManager 子系统被一个 form 字段吃掉。**是否写历史（2026-09-12 demo 实测用户拍板修订）**：sheet 默认**不进历史**——它是页面内 UI 而非导航（系统侧滑不应作用于它）；从 sheet 之上 push 的页面在历史条目里带标记，返回时恢复"页面 + sheet"形态；仅当需要分享/深链时才按需编址；
- toast / tooltip / popover：两测皆"否" → 瞬态层：无帧号、不写历史、不快照、不入池，页面作用域或应用表面，自动消亡，归适配层管。

## 架构共识（六）：演进策略与先例对账

- **双形态挂载**（接入期）：每页既能独立根挂载（`mountMobilePage`，HTML 入口用）也能 shell 内嵌挂载；页面不假设 shell 存在，shell 能力（共享 context、栈、预取）一律可选注入——shell 是纯增强，无 JS/爬虫/深链永远有 HTML 兜底。增量路径：registry 加 `shell` 标志位逐页灰度（对称于现有 `bootstrap` 位）；
- **boot 管线并行**（web 期）：head IIFE（主题）→ shell chunk → 路由清单（head 内预取、boot 只取一次）→ 首页 chunk 并行；之后的"请求与 DOM 并行"变成导航预取（pointerdown 预取 chunk，数据 loader 后置留位）；
- **Ionic 对账**（2026-09-11 调研）：抄——生命周期词汇表（`WillEnter/DidEnter/WillLeave/DidLeave/WillUnload`，Will/Did 成对服务转场窗口，leave ≠ unload 是保活/销毁的分界语法）、每 tab 一栈 + tab 切换不写 history；绕开——纯保活（官方无卸载开关、内存投诉挂多年、用 WillEnter 手工重置状态）、URL 后补（栈模型与框架路由十年打架，URL 文法必须第一天就是一等公民）、自建动画引擎（骑 View Transitions）；
- ViewAdapter 是工程大头（Ionic 的 `@ionic-react` 等都是重量级适配：缝合框架路由、在组件不卸载的地基上合成页面生命周期）——预算按此排，接口先过 R0 审定。

## 未决项

- ViewAdapter 与 context 拆分的具体接口形状（两份契约 + 生命周期映射表 + R0-1~R0-5 待拍板项）——R0 草案已备：同目录 `R0-DECISIONS.md`；**page / solid 期动工前必须审定，审前不动 ViewAdapter 相关代码**；
- 包粒度微调（container 是否再分池子包等）——各期开工前议，默认按"包图景"执行；
- 快照内数据缓存的失效策略，与 `DataResource` snapshot/latest 语义对榫细则（stale-while-revalidate 的跨域协调）——container 期设计时出决策表；
- Navigation API 2026 年目标浏览器覆盖核实；降级层走 history API——web 期前查证；
- 切 tab 写不写 history（replace 不加日志 vs push 可跨 tab 返回）——选修包期前定，产品性格题；
- sheet 下拉手势语义：关一层 vs 整体收起（多级 pop + 合并转场）——选修包期；
- sessionStorage 快照配额与逐出策略——保活池期；
- blog 接入立项时机与内容（含三个已知 bug 收账、kernel 双源切并）——`PLAN-LOOM-DATA-001` 验收后议；
- HTML 入口正文 / OG 预渲染（文章页分享预览与 SEO）——"MPA 补齐清单"里唯一无着落项，独立立项，不属本计划。
