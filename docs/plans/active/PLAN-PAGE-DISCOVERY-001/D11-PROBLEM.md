# D11 问题陈述：同 URL 双端分流与页面接入 schema 冲突（原始材料）

> 状态：2026-10-03 用户提交的问题陈述 + 业界对照，**已决策**——结论见 [DECISIONS.md](./DECISIONS.md) D11。
> 阅读注意：本文 §2.3 所称"撞 outputPath 唯一性"经核查**不成立**（mobile/desktop 前缀天然不同）；选项 B 的真实破坏点是 alias 唯一性测试、后端启动期拒载重复 alias（`static_files.rs:64-69`）、dev `pageRouteMap` 键静默覆盖，详见 DECISIONS D11.1。§4.6"当前要做则不启动 P1"的时序建议亦被否决（D11.2）。其余事实与 INVENTORY 一致。本文按原样存档，不再单独维护。

---

## 一、背景

### 1.1 当前页面接入模型

本仓页面接入的现状（依据 INVENTORY）：

- **单一事实源**：`src/frontend/pages.registry.ts` 登记 17 页（Desktop 11 + Mobile 6）；
- **一条记录的结构**：`PageRegistration` = `id + platform + outputPath + entry + title + description + aliases + bootstrap + shell`（`pages.registry.ts:32-42`）；
- **基数假设**：**一条记录 = 一个 platform + 一个 outputPath + 一个 entry**，即"一页一平台实现"；
- **构建期消费**：`page-template.ts` 按记录生成 HTML，每个 outputPath 产出一个 `.generated/pages/<outputPath>/index.html`；
- **运行时分发**：`site-routes.json`（registry 投影）内嵌进 Rust（`site_routes.rs:14`），Product 与 Mock 经 `/api/public/site-routes` 下发同一份；
- **Rust 静态服务**：`static_files.rs:30-72` 按 outputPath 提供静态文件，**无请求特征感知**（不读 UA）；
- **URL 布局**：desktop 与 mobile 使用**不同的 URL 前缀**（desktop `/...`，mobile `/m/...`），两端不共享 URL。

### 1.2 当前计划的决策基础

`DECISIONS.md` 中 D1–D10 已生效，其中与本问题直接相关的是：

- **D1**：保留中央注册表，不做目录自描述。隐含前提是"一页一记录"；
- **D2**：`site-routes.json` 转生成物，canonical alias 取 `aliases[0]`；
- **D4**：`platform` 字段被校验器消费，强制 `outputPath` 首段 === platform；
- **D6**：装配下沉 `@fluvient-loom/page-kit`，`./mobile` + `./desktop` 子路径导出，两端 UI 隔离；
- **D3**：单一校验器三入口（vite 配置加载期 / `ops page check` / 测试）；
- **D10**：实施排序 P1 校验/生成 → P2 脚手架 → P3 运行时 kit。

计划定位（PLAN-PAGE-DISCOVERY-001）：**页面接入能力建设**，范围限定"npm 包/框架这一半"，非目标明确"不做跨项目/跨仓库接入契约"、"不修改任何源码"。

---

## 二、现象

### 2.1 需求描述

期望实现：**同一个 URL 对 mobile 和 desktop 提供不同的页面逻辑**，具体落地形态为：

- **一个对外 URL**（如 `/article/123`）；
- **构建期产出 2 个 HTML**（mobile 一份、desktop 一份）；
- **Rust 服务端根据 User-Agent 判断**，返回对应的 HTML。

即：URL 是单一入口，平台差异在服务端分流，页面逻辑在各自 HTML 内独立挂载。

### 2.2 与现状的直观差异

| 维度 | 现状 | 目标需求 |
| --- | --- | --- |
| URL 布局 | 两端不同前缀（`/...` vs `/m/...`） | 两端同一 URL |
| HTML 产出 | 一页一 HTML | 一页两 HTML（每平台一份） |
| 分流位置 | 无分流（URL 前缀即区分） | Rust 按 UA 分流 |
| registry 记录 | 一条记录对应一个平台 | 一条逻辑页面需对应两个平台实现 |
| `platform` 字段 | 单值、每记录固定 | 需表达"该逻辑页面有多平台实现" |

### 2.3 触发冲突的具体位置

按当前 schema，要产出 2 个 HTML 必须有 2 个 outputPath（`mobile/pages/...` 与 `desktop/pages/...`），即 2 条记录。但两条记录对应同一个对外 URL，会撞上：

- **outputPath 唯一性校验**（测试期强校验，INVENTORY §6）；
- **site-routes.json 的 `id → URL` 1:1 假设**（测试期键集合双向校验，INVENTORY §3）；
- **D4 的 platform↔outputPath 前缀一致性**（本身不错，但执行粒度是记录级）；
- **D6 的 definePage 无"多平台实现"概念**。

---

## 三、原因

### 3.1 根本原因：schema 的基数假设是"一页一平台实现"

当前 `PageRegistration` 的模型是 **(id, platform, outputPath, entry) 四元组的一一对应**。所有决策（D1 的"一页一记录"、D2 的 canonical 唯一、D4 的 platform 单值校验、D6 的 kit 子路径隔离）都建立在这个基数上。

需求要求的是 **(id, URL) 一对多到 (platform, outputPath, entry)** 的模型转变：一个逻辑页面（id + URL）对应多个平台实现。**这是数据模型层面的基数变化，不是校验规则能绕过的。**

### 3.2 直接原因：URL 与平台实现的解耦

现状中 URL 前缀（`/m/`）**同时承担了两个职责**：

1. 对外路由（用户可见的 URL）；
2. 平台区分（构建期/服务端判断用哪套逻辑）。

需求要求 URL **只承担对外路由职责**，平台区分下沉到服务端 UA 判断。这解耦了原本耦合在一起的两个维度，暴露了 schema 里"platform 是记录级属性"这一隐含假设的不适用。

### 3.3 计划层面的原因：scope 假设不覆盖服务端分流

PLAN 的隐含假设是"页面接入 = 前端 registry 的事"，服务端分流被默认成"不存在的需求"（因为现状用 URL 前缀区分，无需分流）。需求要求服务端成为接入链的一环，**这是对计划 scope 的挑战，而非对某条决策的挑战**。

### 3.4 为什么之前没有暴露

- 现状 17 页全部使用 URL 前缀区分平台（desktop `/...`、mobile `/m/...`），没有页面需要同 URL 双端；
- `platform` 字段在构建链中**实际不被消费**（INVENTORY §2：唯一消费点是测试），其"记录级单值"的语义从未被检验；
- D4 决定"让 platform 被校验器消费"是正确的收敛，但**收敛时沿用了"记录级单值"的既有假设**，未考虑多平台实现场景。

---

## 四、其他关联信息

### 4.1 受影响的决策（冲突清单）

| 决策 | 冲突性质 | 严重度 |
| --- | --- | --- |
| **D1** 中央注册表 | schema 基数从"一页一平台"变为"一页多实现" | 致命（必须改 schema） |
| **D4** platform↔outputPath 校验 | 规则本身不错，执行粒度需从记录级降到实现级 | 严重（可保留规则，改位置） |
| **D2** site-routes.json 生成物 | 取决于 D1 怎么改：若"一页多实现"则几乎不动；若"多记录同 URL"则需支持多 id 同 URL | 中（与 D1 耦合） |
| **D6** kit 与 definePage | definePage 需表达"一页多平台实现"；kit 子路径形态可复用 | 严重（需扩展 API） |
| **D3** 单一校验器 | 纯函数架构不变，加"实现级校验"规则即可 | 轻 |
| **D5/D7/D9/D10** | 与页面粒度无关 | 无 |

### 4.2 不受影响或反而受益的部分

- **D8** Desktop 首绘内嵌：双端 HTML 各自内嵌自己的 site-routes 片段，机制直接复用；
- **D3 的校验器架构**：纯函数、多入口，加规则即可；
- **D5 的 ops page 命令域**：`ops page new` 可扩展为生成双端 entry。

### 4.3 计划 scope 外的关联工作

**Rust 侧 UA 分流不在当前 PLAN 范围内**（PLAN 非目标："不修改任何源码"）。需要：

- `static_files.rs` 增加 UA 感知逻辑；
- Rust 侧需知道"哪些 URL 有双端实现"（依赖 registry 投影的扩展）；
- dev 环境的 `page-routes.ts` 也需 UA 感知（否则 dev 体验不一致）。

这部分应**另立计划**，验收标准、测试方式、部署影响与前端 schema 工作不同。

### 4.4 与 D6.3"第二个真实样本"的关系

D6.3 要求 `definePage` **必须用第二个真实页面验证后才定稿**，理由是当前全仓只有一个完整样本（mobile/detail）。

本需求恰好提供了那个"第二个样本"，且比 mobile/detail 更复杂（涉及双端、双 HTML、URL 共用），是更好的设计驱动。**如果当前要做，它应作为 P3 的样本输入；如果后置，P3 仍需另找样本。**

### 4.5 两个 schema 选项的对比

**选项 A：一页多实现**

```
PageRegistration {
  id, aliases,
  implementations: {
    mobile: { outputPath, entry, ... },
    desktop: { outputPath, entry, ... },
  }
}
```

- site-routes.json 仍 1 id : 1 URL，D2 几乎不动；
- D4 校验降到实现级；
- Rust 侧需知道"该 URL 有 2 个实现，按 UA 选"；
- **语义干净，推荐**。

**选项 B：两条记录同 URL**

```
{ id: 'article-mobile', platform: 'mobile', outputPath: 'mobile/...', aliases: ['/article/123'] }
{ id: 'article-desktop', platform: 'desktop', outputPath: 'desktop/...', aliases: ['/article/123'] }
```

- site-routes.json 需支持多 id 同 URL，D2 改动大；
- 测试键集合双向校验要改；
- Rust 侧处理"同 URL 多 id"；
- 语义混乱（一个逻辑页面变成两个 id）。

### 4.6 决策关键点

**核心问题：这个需求是"当前有具体页面要落地"还是"未来可能"？**

- **当前要做**：不要启动 P1，先补 D11（一页多实现 schema），P1 按新 schema 实现，避免返工。本需求作为 D6.3 的第二样本。
- **未来可能**：PLAN 未决项记清楚"schema 是一页一平台，多平台实现需改 schema，出现时重审 D1/D4/D6"，P1 照常启动。

### 4.7 建议的行动项

1. **确认需求时点**（当前 / 未来），决定改 schema 还是记未决项；
2. **若当前要做**：补 D11，明确"一页 = 逻辑页面 + N 平台实现"的模型，修订 D1/D4/D6 的表述；
3. **Rust 分流另立计划**，本计划只负责前端 schema 能表达一页多实现；
4. **无论哪种**，在 PLAN 未决项登记本问题，避免 P1 实现者误以为 schema 是永久的。

---

## 五、业界参考方案

### 5.1 业界对"同 URL 双端不同内容"的三种标准形态

Google 官方文档将"面向智能手机优化的网站"分为三种配置：

| 配置 | URL 策略 | HTML 策略 | 与需求的对应 |
| --- | --- | --- | --- |
| **响应式设计（RWD）** | 同一 URL | 同一 HTML，仅 CSS 变化 | 不适用（页面逻辑不同） |
| **动态服务（Dynamic Serving）** | 同一 URL | **不同 HTML，按 UA 决定** | **精确对应** |
| **独立移动站点** | 不同 URL（`m.` 子域） | 不同 HTML | 不适用（URL 不同） |

**关键结论**：需求属于业界标准中的"动态服务"配置，即 **"one URL, different HTML based on User-Agent"**。Google 对此的官方建议是：**必须使用 `Vary: User-Agent` HTTP 头**，告知缓存服务器和搜索引擎"同一 URL 的内容可能因 UA 而异"。

这对本仓的直接含义：Rust 分流实现时，`static_files.rs` 对同 URL 双端页面**必须返回 `Vary: User-Agent`**，否则 CDN/代理缓存可能把 mobile 的 HTML 错误地返回给 desktop 请求。

### 5.2 业界实现模式对照

#### 模式 A：服务端路由分支（Rails Request Variants）

Rails 的 `request.variant` 机制是最接近"一页多实现"的**框架原生**方案：

```ruby
# before_action 中根据 UA 设置 variant
def set_variant
  browser = Browser.new(request.user_agent)
  request.variant = :mobile if browser.device.mobile?
end
```

模板文件命名：`app/views/posts/index.html.erb`（默认）与 `index.html+mobile.erb`（mobile variant）。

**与本仓的映射**：一条逻辑模板名 + variant 后缀 = 多个物理文件；对应"一个 registry 记录 → N 个物理产物，产物靠 platform 维度区分，而非独立 id"。

#### 模式 B：构建到两个目录 + 服务端按 UA 选择（Angular/Express）

构建期产出多份 HTML（如 `DIST_FOLDER/ssr/index.html` 与 `csr/index.html`），Express 路由按请求特征（crawler UA、Googlebot UA）选择返回哪一份。Rust `static_files.rs` 的 UA 分流与此**完全同构**。关键差异：Angular 例子的两份 HTML 是同一入口的两种渲染模式（SSR vs CSR），本仓需求是两套不同平台页面逻辑，比 SSR/CSR 分叉更重；但服务端选择逻辑可直接借鉴。

#### 模式 C：Vite MPA 多入口 + 自定义中间件

Vite 官方支持 MPA，每个入口一个 HTML；社区插件自动发现入口。本仓 `page-template.ts` 本质是定制 MPA 插件。Rollup `input` 可配置多入口（构建期可实现）；问题不在 Rollup，而在上游 registry 能否表达"这两个入口属于同一逻辑页面"。

#### 模式 D：Next.js Parallel Routes（相邻概念，非直接对应）

Parallel Routes 是**同一 HTML 内**的运行时条件渲染（slot 不改变 URL）；本仓需求是构建期两个独立 HTML + 服务端分流，不在同一抽象层。可借鉴的仅是"用命名 slot 表达同 URL 的多个渲染出口"这一概念。

### 5.3 对 schema 设计的启示：三种可选模式

1. **变体后缀模式**（Rails 风格）：一条记录 + platform 变体展开。记录数不翻倍、id:URL 仍 1:1；但 outputPath/entry 单值语义被打破，需引入"展开规则"。
2. **实现映射模式**（Angular 双目录风格）：`implementations: { mobile, desktop }`。显式、可校验、site-routes.json 不动；schema 改动最大，消费方都要适配。**（D11 采纳此模式）**
3. **逻辑页面 + 独立 id 模式**：两条记录共享 alias。零 schema 改动；但 site-routes 需支持多 id 同 URL、`route()` 语义模糊、Rust 侧需额外知道 id 归属。**（D11 否决，真实破坏点见文首标注）**

### 5.4 业界对"动态服务"的额外约束

1. **`Vary: User-Agent` 头是必须的**——否则缓存层会把一份 HTML 错误地缓存给所有 UA；
2. **URL 是唯一标识，内容变体不改变 URL 语义**——同 URL 便于用户交互、分享与链接；
3. **SEO 等价性**——Google 用不同 Googlebot UA 爬取同一 URL，服务端分流必须对 mobile Googlebot UA 返回 mobile 内容；
4. **移动优先索引**——mobile HTML 的结构化数据、canonical 标签等元数据必须完整。

---

## 附：一句话概括

**现状 schema 是"一页一平台实现"，需求是"一页多平台实现、同 URL 服务端 UA 分流"，两者在数据模型基数上冲突；冲突集中在 D1/D4/D6，D2 视 D1 改法而定；Rust 分流在计划 scope 外，需另立计划。**
