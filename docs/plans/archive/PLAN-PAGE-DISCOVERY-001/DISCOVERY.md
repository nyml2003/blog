# 页面发现机制（讨论稿）

> 状态：讨论稿，不是 Spec，不自动生效。对应计划见 [PLAN](./PLAN.md)；包形态议题见 [PAGE-KIT](./PAGE-KIT.md)。
> 现状描述基于 2026-10-03 源码核实，引用路径以仓库为准。
> 2026-10-03 定位更新：服务发现/类比框架（§2.2、§3）按用户共识降级为历史材料；当前讨论以"接入的人需要做什么、需要懂什么"的接入者视角展开，见 PLAN"目标"。

## 1. 问题定义

"页面发现"其实包含三个子问题，分开讨论才不会搅在一起：

| 子问题 | 含义 | 本仓库现状 |
| --- | --- | --- |
| **注册**（Registration） | 一个新页面如何让系统知道它存在？登记什么、在哪登记、谁来登记？ | 人工编辑 `pages.registry.ts` + 建入口文件 + 建 slice 目录 |
| **发现**（Discovery） | 构建链与运行时如何枚举、定位页面？ | 构建期：vite 插件消费 registry；运行时：site-routes 清单 |
| **解析**（Resolution） | 页面之间如何互相引用而不 hardcode 路径？ | `route(context.routes, "<id>")` 语义名 → 路径 |

## 2. 现状机制：技术说明

### 2.1 全链路

```
pages.registry.ts（人工登记，17 页，单一事实源）
  │
  ├─ 构建期消费（src/frontend/vite-plugins/）
  │    ├─ page-template.ts   每页生成 HTML：meta + App Shell 预渲染 + <div id="app"> + 入口 script
  │    ├─ page-bootstrap.ts  bootstrap:true 页向 head 注入共享内联引导脚本（先于 JS 挂载执行）
  │    └─ page-routes.ts     dev 中间件：alias URL → outputPath 重写
  │
  ├─ 投影：site-routes.json（测试守卫同步）
  │    ├─ 编译期内嵌：src/core/protocol/src/site_routes.rs
  │    └─ 运行时下发：GET /api/public/site-routes（Product 与 Mock 同源，契约 SPEC-SITE-ROUTES-001）
  │
  └─ 运行时装配（bootstrap/environment.tsx）
       ├─ Mobile：构建期内嵌清单（首绘零等待）
       ├─ Desktop：运行时拉取 api.siteRoutes.get()
       └─ 解析：route(context.routes, "<id>") → 页面渲染 <a href>
```

要点：**登记一次，四处消费**（HTML 生成、引导注入、路由清单、运行时解析），消费方全部从同一份注册表派生，没有第二真相。

### 2.2 服务发现概念映射

| 服务发现概念 | 本仓库对应物 | 备注 |
| --- | --- | --- |
| 注册表（Registry） | `pages.registry.ts` | 构建期静态登记 |
| 注册记录 | `PageRegistration`（id/platform/outputPath/entry/title/description/aliases/bootstrap/shell） | 声明式元数据，已含能力标记（`bootstrap`）与预渲染描述（`shell`） |
| 注册动作 | 人工三步（registry 条目 / 入口文件 / slice 目录） | **当前接入成本所在**，脚手架议题见 PAGE-KIT |
| 配置分发 | registry → `site-routes.json` 投影 → 协议内嵌 + API 下发 | 多端同源，schema 双端校验（`siteRoutesSchema` / Rust 协议）+ 测试守卫 |
| 发现查询 | `route(context.routes, "<id>")` | 语义名解析，页面互不 hardcode 路径 |
| 健康检查 | 无运行时等价物 | 静态页面集合没有实例生命周期；等价物是构建门禁 + schema 校验 + e2e |
| 客户端 SDK | bootstrap environment + `route()` helper | kit 化议题见 PAGE-KIT |

### 2.3 现状已满足的服务发现最佳实践

- **注册与解析解耦**：页面引用只依赖语义 id，不依赖物理路径；
- **声明式元数据**：注册即声明能力（`bootstrap`、`shell`），消费方按需取用；
- **单一事实源多端投影**：Rust 协议内嵌、API 下发、Mobile 构建期内嵌同源，由测试守卫防漂移；
- **注册即可被发现**：新页面登记后，构建链自动产出 HTML/shell/路由，无需改任何消费方代码。

## 3. 业界参考

| 实践 | 做法 | 对本仓库的启示 |
| --- | --- | --- |
| **Next.js App Router / SvelteKit / Astro** | 文件约定路由：页面目录自描述，构建期聚合生成 manifest（"自注册"） | 方向 B 的原型；它们有框架级约定与文档体系做后盾 |
| **Kubernetes 服务发现** | 双层：Pod 按 label 自描述、由 controller 聚合（自注册）；对外则是显式 Service 对象（中央契约） | "内部自描述 + 外部显式契约"可以并存；对外契约（site-routes）已经是显式的 |
| **Consul / Eureka / etcd** | 注册表 + TTL 心跳 + 健康检查 + 故障摘除 | 面向**动态**服务集合；本仓库页面构建期已知、无上下线，心跳/摘除没有对应问题，**不应引入** |
| **DNS** | 最古老的名字解析：名字稳定、地址可变 | `alias → outputPath` 解析表的同构；语义 id 稳定、路径可重构，现状已做对 |
| **Webpack Module Federation 等微前端运行时发现** | 运行时协商模块可用性 | 面向运行时动态组合；本仓库是 SSG 静态托管，无此需求 |

**关键判断**：服务发现分两半——"动态半边"（心跳、摘除、负载均衡、运行时协商）服务于实例生命周期不确定的服务集合；"静态半边"（注册与解析解耦、声明式元数据、单一事实源）服务于任何需要解耦的系统。本仓库只需要静态半边，而且大部分已经做到了。

## 4. 候选方向

### 方向 A：中央静态注册表 + 脚手架自动化（现状 + 自动化，默认推荐）

保持 `pages.registry.ts` 为唯一登记点，用 `ops page new` 之类的脚手架把"三步登记"变成一条命令（生成 registry 条目 + 入口文件 + 三个 slice 模板）。

- 优点：注册显式可审计（可 grep 的单一事实源）；构建链零改动；门禁语义不变；
- 代价：接入成本从"三步手工"降为"一条命令 + 填业务"，registry 文件本身仍存在；
- 符合 `FACT-PRODUCT-001` 的定位：单维护者知识库，显式简单优先。

### 方向 B：页面目录自描述 + 构建期聚合

每个 slice 目录放 `page.config.ts`（自描述），vite 插件扫描聚合生成等价 registry。业界主流框架走这条。

- 优点：接入成本降到"建目录"，无中央文件可冲突；
- 代价：注册变隐式（不能再 grep 一张表回答"有哪些页面"）；构建链新增扫描/聚合/校验复杂度；source-layout 门禁与 site-routes 投影需要围绕聚合产物重建；
- 适用条件：页面数量或贡献者数量增长到中央表成为瓶颈。当前 17 页、单维护者，不成立。

### 方向 C：运行时发现

页面集合运行时才可知（动态挂载/微前端）。本仓库 SSG + nginx 静态托管，无此需求，**排除**；若未来出现跨仓库接入再重启讨论（用户已决策当前不做）。

## 5. 待决策问题（附默认推荐）

1. **注册方式**：A（默认推荐）还是 B？——判据是"显式可审计"与"接入动作最少"之间当前更看重哪个；
2. **registry 元数据边界**：`PageRegistration` 目前只承载构建/路由/shell 元数据；页面级 BFF 聚合声明（PLAN-NAV-ACTIONS-001 的 `modules[]` 先例）未来是否也登记进来？默认推荐：暂不扩张，等第二个消费方出现再登记化；
3. **解析覆盖面**：页面互链已走 `route()`；导航 shell、预取清单（mobile-prefetch 硬编码了 `/m` 与 category-shelf URL）是否统一从 registry/site-routes 派生？默认推荐：预取清单纳入派生是正收益，但归预取专项，本计划只记录不对称。
