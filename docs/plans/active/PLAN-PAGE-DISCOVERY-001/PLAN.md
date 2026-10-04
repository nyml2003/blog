---
kind: plan
id: PLAN-PAGE-DISCOVERY-001
status: completed
owner: project-manager
created: 2026-10-03
last_reviewed: 2026-10-03
---

# 页面发现机制与低成本接入（设计讨论）

## 目标

回答一个问题：**如何让一个新页面低成本接入页面服务？**

2026-10-03 讨论第一轮，用户固定定位与风格共识：

- 建设的是一套**页面接入能力**，不是 npm 包发布本身；形态是**简化的 MPA 微前端框架，富代码而非低代码**；
- 框架分两半：**写页面的人用的**（`definePage` 等）+ **接页面的人/构建链用的**（vite 插件、registry 投影、校验）——构建期能力可能才是接入能力的核心；
- 终态设想"别人装一个 npm 包 + 在配置平台上操作几下即可接入"；配置平台太重**后置不做**，当前只讨论 npm 包/框架这一半；"仓内省事"与"别人能接入"是两个问题，分开评估；
- 写页面的人只需描述"页面是什么"，不需要懂构建、分发、解析；
- 讨论方式：不堆术语、不为专业感引入类比——服务发现/K8s/DNS 类比暂放一边（`DISCOVERY.md` 的类比框架降级为历史材料）；先问"接入的人需要做什么、需要懂什么"，再谈机制；
- 交付排序共识：**先校验，再脚手架，最后运行时 kit**；可逆性低的决策先拍，不被细节稀释。

当前阶段：事实探查——7 项开放问题（见"未决项"）由源码探查回答，产出 `INVENTORY.md` 后回填讨论。

历史讨论材料：`DISCOVERY.md`（发现机制三方向）、`PAGE-KIT.md`（包形态与边界）；其中的默认推荐在定位修订后需重新过闸门。

## 计划价值

- 现状链路（`pages.registry.ts` → vite 插件 → `site-routes.json` → 协议内嵌/API 下发 → `route()` 解析）已经完整工作，但从未被当作一个"机制"显式设计过；讨论稿补上概念模型，让后续决策有共同语言。
- "每个页面抽一个 npm 包"的直觉与包立项判据冲突，需要一份可引用的判断依据，避免反复。
- 低成本接入的真正杠杆（脚手架、`definePage`）与一条架构边界（bootstrap 是唯一装配 `@fluvient-loom/web` 的层）纠缠，必须一起决策，不能局部顺手做。

## 当前基线（2026-10-03 现场核实）

- **注册表**：`src/frontend/pages.registry.ts` 登记 17 页（Desktop 11 + Mobile 6）；`PageRegistration` 元数据含 `id/platform/outputPath/entry/title/description/aliases/bootstrap/shell`。
- **构建期消费**：`src/frontend/vite-plugins/` 三个插件——`page-template.ts`（按登记生成 HTML + App Shell 预渲染）、`page-bootstrap.ts`（向 `bootstrap: true` 页注入内联引导脚本）、`page-routes.ts`（dev 中间件按 alias 重写到 outputPath）；三者签名均已接受 `registrations` 注入，本身是通用的。
- **运行时分发**：`site-routes.json` 为 registry 投影（测试守卫同步）；`src/core/protocol/src/site_routes.rs` 编译期内嵌，Product 与 Mock 经 `/api/public/site-routes` 下发同一份；行为契约见 `SPEC-SITE-ROUTES-001`。
- **解析**：Desktop 在 bootstrap 运行时拉取清单（`bootstrap/desktop/environment.tsx:29`）；Mobile 构建期内嵌同一份清单（`bootstrap/mobile/environment.tsx`，首绘零等待，PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001 交付）；页面间引用走 `route(context.routes, "<id>")` 语义名解析。
- **边界**：bootstrap 是唯一允许装配 `@fluvient-loom/web` 适配器的层（`SPEC-ARCH-BOUNDARY-001` + source-layout 门禁测试机械化）。
- **包惯例**：16 个 `@fluvient-loom/*` / `@fluvient-cli/*` 包全部按能力切分（port/query/command/net/web/app-shell/persisted-state/cli-kit/…），全部 private workspace；exports 子路径与 solid-js peerDependencies 先例齐备（`mobile-h5-solid-atoms`、`persisted-state`）。

## 约束与依据

- 事实：`FACT-PRODUCT-001`（个人长期沉淀型知识库——页面数量与维护者数量有限，机制复杂度预算应偏向显式、简单、可审计）；
- Spec：`SPEC-ARCH-BOUNDARY-001`（前端层序与两端隔离门禁）、`SPEC-SITE-ROUTES-001`（路由清单契约）；
- 相关已归档计划：PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001（17 页接入 bootstrap）、PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001（包收敛与 npm 发布未决策）、PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001（边界输入归一化先例）、PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001（site-routes 内嵌）；
- 用户已决策（2026-10-03，同日修订）：定位为**页面接入能力**建设——近期讨论 npm 包/框架这一半，"仓内省事"与"别人能接入"分开评估，不发布 npm；配置平台后置。

## 本轮范围与非目标

范围：

- 本计划目录内 `DISCOVERY.md`、`PAGE-KIT.md` 两份讨论稿与本 PLAN；
- `docs/plans/README.md` 索引登记。

非目标：

- 不修改任何源码、构建配置或测试；
- 不实现 kit、不动 bootstrap、不发布 npm、不做跨项目/跨仓库接入契约；
- 讨论稿不是 Spec 也不是 FACTS：收敛的行为契约定稿后须按 AGENTS.md 流程另立/修订 Spec，不自动生效；
- 不在本计划内预回答所有实现细节（definePage API 形状等留待实现 Plan）。

## 执行记录

- 2026-10-03 立项；同日交付 `DISCOVERY.md` 与 `PAGE-KIT.md` 讨论稿（含机制技术说明、业界对照、带默认推荐的待决策问题），进入讨论阶段。
- 2026-10-03 讨论第一轮：用户固定定位与风格共识（已回填"目标"），列出 7 项探查型开放问题；启动只读源码探查，事实回填 `INVENTORY.md`（进行中）。
- 2026-10-03 探查完成：三路并行探查（构建链插件与注册表、运行时装配与页面样板、ops 命令域与 Desktop 首绘）合并写入 `INVENTORY.md`，7 项开放问题逐项回答（速查表见其 §9）。两项事实推翻此前讨论稿的默认推荐：ops 无生成器先例（`ops page new` 是新类别而非"对齐"，PAGE-KIT §5.3）；environment 真实共享面仅 4 块重复代码（"共享核心+两端适配"三包结构缺乏事实支撑，PAGE-KIT §2）。闸门讨论待用户基于 INVENTORY 过问。
- 2026-10-03 决策完成：用户委托代理结合业界实践拍板，D1–D10 写入 `DECISIONS.md`（每条附业界依据与本仓事实依据）。同日 D2/D6/D8 及 CI 检查步骤经用户以通俗语言逐项确认批准，全部决策生效。用户补充统辖性设计原则"该重复时重复，该复用时复用"（声明可重复、机制须复用），已写入 DECISIONS.md 并修正 D6 的 definePage 目标表述。下一步：派生 P1 实现计划（校验与生成）。
- 2026-10-03 D11 补录：用户提出"同 URL 双端、服务端按 UA 分流"需求并提交问题陈述（含业界对照）。经核查采纳"一页多实现"为目标模型，纠正陈述中一处事实错误（outputPath 唯一性实际不冲突，真实冲突是 alias 唯一性/后端拒载/dev Map 覆盖），否决"当前要做则暂停 P1"的时序建议（校验器是迁移安全网，P1 先行并增加归一化形态接缝）。用户确认需求属"以后可能用上"，D11 停在触发条件上；Rust UA 分流（含 Vary 头）另立计划。
- 2026-10-03 收尾（completed）：讨论目标全部达成——定位与风格共识固定、7 项探查问题回答（INVENTORY）、11 项决策拍板并批准（DECISIONS）、D11 停泊。交付物：PLAN/INVENTORY/DECISIONS/D11-PROBLEM/两份历史讨论稿，保留在原目录作为 P2/P3 与 D11 触发时的活引用，不随归档失效。派生：[PLAN-PAGE-ONBOARDING-001](../PLAN-PAGE-ONBOARDING-001/PLAN.md)（P1：校验、生成与桌面首绘内嵌，试点 desktop-public-detail）已立项 ready。未交付：P2/P3 计划（P1 验收后另立）；Rust UA 分流计划（D11 触发时另立）。

## 决策闸门

2026-10-03 用户委托代理决策（"结合业界实践自己决策"），D1–D10 已拍板，详见 [DECISIONS.md](./DECISIONS.md)：

- D1 注册方式：保留中央注册表（方向 B 否决）；
- D2 site-routes.json 转生成物 + `aliases[0]` canonical 约定；**待批准（Spec 修订）**；
- D3 单一校验器三入口（vite 配置加载期 fail fast / `ops page check` / 测试执法），补 alias×outputPath 交叉冲突；
- D4 platform 字段被校验器消费（强制 outputPath 前缀一致）；
- D5 开 `ops page` 新命令域（check 先行、new 后至）；
- D6 装配下沉 `@fluvient-loom/page-kit`（`./mobile`+`./desktop` 子路径，root 仅纯逻辑；definePage 需第二个页面验证）；**待批准（SPEC-ARCH-BOUNDARY-001 修订 + 门禁改写）**；
- D7 命名 `page-kit`；
- D8 Desktop 首绘内嵌随生成器落地，运行时端点保留；**待批准（SPEC-SITE-ROUTES-001 修订 + CI 加 check 步骤）**；
- D9 vite 插件不下沉（出现第二消费者再评估）；
- D10 排序 P1 校验/生成 → P2 脚手架 → P3 运行时 kit。

## 成功标准

1. 两份讨论稿各自覆盖三块：关键机制的技术说明（基于现场核实的现状）、业界最佳实践对照、待决策问题（每个带默认推荐与理由）；
2. 现状描述与源码一致，引用的文件路径和行号真实；
3. 文档链接有效、`git diff --check` 干净（按 AGENTS.md 文档类验证标准，不要求代码门禁）;
4. 讨论产出明确走向：派生实现 Plan、`parked` 或 `superseded`，决策结果记入本计划闸门与执行记录。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 讨论稿撰写 | pm | - | 本计划目录、`docs/plans/README.md` | completed |
| 讨论与决策收敛 | pm + 用户 | 讨论稿 | 本 PLAN（闸门、执行记录、未决项） | in-progress |
| 派生实现 Plan（如决策执行） | pm | 决策收敛 | `docs/plans/active/` 新计划 | pending |

单一 write set、串行工作流，无并行拆分需求。

## 集成验收

- 文档类验证：交叉链接可达、引用的 Spec/事实/计划 ID 真实、示例与现状一致、`git diff --check` 干净；
- 无代码与运行时改动，不要求 `ops quality check`。

## 未决项

- ~~D2/D6/D8 的用户批准~~（2026-10-03 已全部批准）；
- `definePage` API 形状：按 D6.3 需第二个真实页面验证后定稿（P3 内解决）；
- **D11 触发时点已定**（2026-10-03 用户确认"以后可能用上"）：同 URL 双端分流目标模型与 P1 归一化接缝已定（DECISIONS D11），登记表结构改造停在触发条件上——出现第一个真实双端同 URL 页面时启动；P1 只需落实归一化形态要求；
- Desktop 内嵌（D8）归 P1 还是独立小计划：派生 Plan 时定；
- 历史讨论稿 `DISCOVERY.md`、`PAGE-KIT.md` 中与本决策冲突的默认推荐以 DECISIONS.md 为准，两稿收尾时加终稿标注或归档，不再单独维护。
