---
kind: spec
id: SPEC-ARCH-BOUNDARY-001
status: accepted
owner: backend
last_reviewed: 2026-10-04
---

# 架构分层边界规则

## 目标

将两条分层原则成文并自动化执行：前端页面只管 UI 编排，数据获取和宿主能力经明确的查询层或 ports 进入；后端 HTTP 只管协议适配，编排归 BFF/领域层，protocol 是纯契约，Data 是类型化事务域。边界违规以 Cargo manifest 依赖禁令与评审拦截（源码内容扫描已于 2026-10-04 退役）。

## 非目标

- 旧前端运行时（`solid/`、`common/`、`{desktop,mobile}/src` 页面链路）已删除，本 Spec 不维护其兼容边界；
- 不以架构门禁替代 API、产品行为、性能或视觉验收；
- 不改变 Desktop/Mobile UI 隔离规则；
- 具体重构和迁移范围由当前任务单独确定。

## 前端分层规则

`src/frontend/` 采用功能切片 + 严格向下依赖（FSD 适配版，2026-10-01 重组，PLAN-FRONTEND-FSD-RESTRUCTURE-001）：

```text
bootstrap/{desktop,mobile}/   组合根：page-kit 的唯一调用点——只组合应用声明
                              （api 工厂、内嵌路由清单、页面工厂）并挂载
mobile/  desktop/             平台世界（UI 隔离边界）
├── pages/<slice>/            页面（UI 编排；不触碰宿主能力）
├── widgets/<slice>/          复合组件（shell、article-card 等）
├── features/<slice>/         业务模型（model/persistence 等；数据获取在此）
└── foundation/{api,styles,ui}/  端内基础层（api=端内 API 客户端与 BFF 归一化）
kernel/                       纯机制（desired-state；ports/Task/Resource 来自 @fluvient-loom/port|query 包）
domain/ protocol/ validation/ 跨端契约与输入校验（route-input、article-html 等）
```

**宿主适配器装配点（2026-10-04 修订）**：`@fluvient-loom/web`/`net` 等宿主适配器只允许在 `@fluvient-loom/page-kit`（`./mobile`、`./desktop` 子路径）内装配；bootstrap 不得直接装配适配器。端口形状的唯一声明在 page-kit（`WebMobilePorts`/`WebDesktopPorts`），端内 context 经 type-only 继承追加应用声明。构建链半边（校验/生成/插件/脚手架）在 `@fluvient-loom/page-build-kit`。

依赖方向：`bootstrap → 平台世界（pages → widgets → features → foundation）→ kernel/domain/protocol/validation`，同层 slice 互不 import，跨端零 import。2026-10-04 起层序不再由源码扫描门禁拦截（`source-layout.test.ts` 已删除）：包内导入不设路径级限制，跨端硬隔离逐步由 workspace 包（`src/frontend/packages/`）承载，kernel 宿主纯度仍由 `tests/app/kernel/tsconfig.json`（无 DOM lib）编译保证。

**禁令（2026-10-04 起为设计意图；机器执行仅限 Cargo manifest 依赖禁令与 kernel 的 DOM-free 编译）**：

| 层 | 禁止 |
| --- | --- |
| 任一新结构模块 | 向上依赖（如 features import pages/widgets、foundation import 任一上层）；import 已删除的旧运行时路径（`common/`、`solid/`、`{desktop,mobile}/src`、`desktop-ui/`、`mobile-ui/`） |
| 同层 slice（pages/widgets/features） | import 同段兄弟 slice |
| 平台世界（mobile 与 desktop，含各自 bootstrap） | 互相 import |
| `kernel/` | import Solid、DOM、网络、存储、Node 宿主、宿主适配器包或 kernel 白名单（`@fluvient/core`、`@fluvient-loom/port|query`）之外的包；直接使用 fetch、window、document、storage、process 等宿主能力 |
| `{mobile,desktop}/foundation/api` | import Solid、宿主适配器包、UI 或旧运行时 |
| 平台世界模块 | import 宿主适配器包或旧运行时；宿主能力必须经注入的 ports |
| `mobile/pages` | 直接访问 `MobilePageContext` 或 `context.api|navigation|persistence`（宿主能力留在 bootstrap 与 features） |
| 世界目录形态 | pages/widgets/features/foundation 之外的一级目录；foundation 下 api/styles/ui 之外的子目录；bootstrap 下 desktop/mobile 之外的平台目录 |

## 后端分层规则

```text
product/http      协议适配：路由、参数解析为类型化 Query、envelope、结构化日志
product/bff       编排：分组 / 截断 / 推荐规则 / 聚合决策（含 content_* 等领域模块）
core/protocol     纯契约：scene / operation / DTO 形状与序列化映射
backend/data      Data Server HTTP 适配 + 类型化事务操作：store/domain 内 SQL 私有；禁 HTML 解析、禁 HTTP/GitHub 感知
```

**禁令（2026-10-04 起后两行由 Cargo manifest 依赖禁令机械化，前两行为设计意图、由评审与模块边界承载）**：

| 层 | 禁止 |
| --- | --- |
| `product/http` | 内联 BFF 决策（分组、截断、推荐开关、聚合规则）；散放 `parse_*` 之外的语义转换 |
| `core/protocol` | 业务决策：分组 / 排序规则 / 兜底策略（"未分类"兜底等属 BFF）；只允许形状映射 |
| `backend/data` 的 store/domain | 解析 HTML、感知 HTTP / GitHub（Data Server 自身的 HTTP adapter 例外） |
| `product`（除 data_client） | 直接访问 SQLite |

以上是当前边界，不是待治理清单。历史违规已从主文档移除；是否存在新违规以当前源码与 Cargo manifest 依赖禁令结果为准。

## 门禁要求

- 依赖禁令在 `ops quality check` 以 Cargo manifest 检查执行（data 禁 HTML 解析器与外部 HTTP/GitHub 客户端、product 禁直连 SQLite）；前端层序与 Rust 内容级规则不再由源码扫描执行（2026-10-04 退役），由评审与包结构承载；
- 检查规则本身有测试（改坏规则文件会红）。

## API 路由契约单一清单（golden）

当前以 `docs/api/routes.json` 作为中性 golden 清单，双端测试对照实际实现：

- `docs/api/routes.json` 声明 `endpoint × sceneCode × method` 全集；
- Rust 测试：清单条目全部被 http 分发覆盖、`scene.rs` 常量与清单一致；
- TS 测试：`client.ts` 全部方法的 path/sceneCode ⊆ 清单；
- 不做双语言 codegen（低依赖取舍，见本 Spec 的契约和当前实现）；
- 与 `SPEC-CONTENT-GITHUB-TRUTH-001` 的管理协议冻结协调：其新增管理 sceneCode 一并入 golden 清单，REPO-CONTRACT 交付的协议表与本清单为同一事实。

## 场景

### SPEC-ARCH-BOUNDARY-001-001

Given 前端层序与页面数据访问规则为设计意图（源码扫描门禁已退役）

When 页面代码直接装配网络、存储或 wire DTO

Then 评审不通过；kernel 引入宿主能力仍由 DOM-free 编译拦截

### SPEC-ARCH-BOUNDARY-001-002

Given 平台世界页面需要业务数据或宿主能力

When 页面发起读取、写入或访问浏览器能力

Then 页面通过 foundation/api 与 features 模型和注入的 ports；页面不直接装配 transport、存储或 wire DTO

### SPEC-ARCH-BOUNDARY-001-003

Given 任意后端变更

When 审查 `http.rs` 与 `wire.rs`

Then `http.rs` 无 BFF 决策（仅适配与分发调用）；`to_shelf` 类编排逻辑位于 product 的 BFF 模块；protocol 只含形状映射

### SPEC-ARCH-BOUNDARY-001-005

Given 内容级规则为设计意图（源码扫描门禁已退役）

When 新代码试图把编排逻辑写进 protocol 或让页面直接调 client

Then 评审拦截；编排逻辑应位于 product 的 BFF 模块

### SPEC-ARCH-BOUNDARY-001-006

Given golden 清单与双端对照测试生效

When 新增 / 改动任一场景（endpoint × sceneCode）而清单未同步，或清单有项而任一端未实现

Then 对应测试失败（Rust 或 TS 侧红灯）

### SPEC-ARCH-BOUNDARY-001-007

Given 层序规则为设计意图（层序门禁已于 2026-10-04 移除）

When 新代码向上依赖、跨 slice/跨端 import 或 world 目录形态越界

Then 评审不通过；kernel 引入宿主能力由 DOM-free 编译拦截

## 边界与失败

- 新运行时的数据用例位于平台世界 features/foundation，宿主实现位于 `@fluvient-loom/web`/`node` 适配器包（浏览器端装配收敛于 `@fluvient-loom/page-kit`），抽象能力位于 kernel 与 `@fluvient-loom/port|query`；
- 与其他当前工作的写集冲突（`http.rs`、`wire.rs`、`client.ts`、各页面文件）：先完成契约和写集协调，再串行执行整改；
- 治理中发现“边界正确但实现腐化”的项：登记问题并另行明确范围，不在本 Spec 中隐式扩大改动。

## 测试/验收证据

- 前端层序门禁（`source-layout.test.ts`）与 `apps/blog/src/quality/architecture.ts` 的源码内容扫描（前端 import 建图、Rust 内容启发式）均已于 2026-10-04 退役；架构扫描仅保留 Cargo manifest 依赖禁令，其余规则转为设计意图，由评审与包结构承载。文档不以历史计划代替当前扫描结果。
- 后端边界由 Rust 模块检查、契约测试和真实 Product→Data 链路测试共同覆盖；门禁规则覆盖 Data Cargo manifest 的 HTML parser 与外部 HTTP/GitHub client 依赖、product 的直连 SQLite 依赖；API golden 同时由 Rust 生产路由/scene 契约和 TS client 实际调用测试对照。
- 历史通过结果（含历史 `ops quality check` 快照）不替代当前复跑；当前验收以现有 `ops quality check`、相关运行测试和用户产品确认共同决定。

## 修订记录

- 2026-10-04（PLAN-PAGE-PACKAGING-001 P3b）："bootstrap 是唯一允许装配宿主适配器的层" 修订为 "page-kit 是宿主适配器的唯一装配点，bootstrap 是唯一调用点"——装配代码从 bootstrap 文件收敛进 `@fluvient-loom/page-kit` 包（两端子路径，UI 隔离边界在包内成立）；不变式强度增加（装配从 17 个入口收敛为包内一处）。
- 2026-10-04：源码内容扫描门禁整体退役（前端 import 建图与 Rust 内容启发式，含已删除目录的墓碑规则）；依赖禁令收敛到 Cargo manifest 层（data 禁 HTML 解析器与外部 HTTP/GitHub 客户端、product 禁直连 SQLite）；前端层序与内容级规则转为设计意图，豁免机制随门禁一并移除。
