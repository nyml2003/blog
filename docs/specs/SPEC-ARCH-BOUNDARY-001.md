---
kind: spec
id: SPEC-ARCH-BOUNDARY-001
status: accepted
owner: backend
last_reviewed: 2026-10-01
---

# 架构分层边界规则

## 目标

将两条分层原则成文并自动化执行：前端页面只管 UI 编排，数据获取和宿主能力经明确的查询层或 ports 进入；后端 HTTP 只管协议适配，编排归 BFF/领域层，protocol 是纯契约，Data 是类型化事务域。边界违规由质量门禁拦截。

## 非目标

- 旧前端运行时（`solid/`、`common/`、`{desktop,mobile}/src` 页面链路）已删除，本 Spec 不维护其兼容边界；
- 不以架构门禁替代 API、产品行为、性能或视觉验收；
- 不改变 Desktop/Mobile UI 隔离规则；
- 具体重构和迁移范围由当前任务单独确定。

## 前端分层规则

`app/` 是唯一页面运行时：

```text
bootstrap（组合根，唯一允许装配 @fluvient-loom/web 等宿主适配器的层）
├── habitat/api + habitat/desktop + habitat/mobile（业务、资源、页面和 UI）
└── kernel（desired-state 状态原语；ports/Result/Task/Resource 来自 @fluvient-loom/port|common|query 包）
```

**禁令（门禁断言，规则文件 `apps/blog/src/quality/architecture.ts`）**：

| 层 | 禁止 |
| --- | --- |
| 任一 `app/` 模块 | import 旧前端运行时（`common/`、`solid/`、`desktop/`、`mobile/`、`desktop-ui/`、`mobile-ui/`）或跨平台 UI |
| `app/kernel` | import Solid、DOM、网络、存储、Node 宿主、宿主适配器包（`@fluvient-loom/web`/`node`）或 kernel 白名单（`@fluvient-loom/common|port|query`）之外的包；直接使用 fetch、window、document、storage、process 等宿主能力 |
| `app/habitat/api` | import Solid、宿主适配器包、UI 或旧运行时 |
| `app/habitat/desktop`、`app/habitat/mobile` | import 宿主适配器包或旧运行时；宿主能力必须经注入的 ports |
| `app/bootstrap` | import 旧运行时；它只组合宿主适配器与 habitat |
| Desktop UI 与 Mobile UI | 互相导入 |

## 后端分层规则

```text
product/http      协议适配：路由、参数解析为类型化 Query、envelope、结构化日志
product/bff       编排：分组 / 截断 / 推荐规则 / 聚合决策（含 content_* 等领域模块）
core/protocol     纯契约：scene / operation / DTO 形状与序列化映射
backend/data      Data Server HTTP 适配 + 类型化事务操作：store/domain 内 SQL 私有；禁 HTML 解析、禁 HTTP/GitHub 感知
```

**禁令（门禁断言）**：

| 层 | 禁止 |
| --- | --- |
| `product/http` | 内联 BFF 决策（分组、截断、推荐开关、聚合规则）；散放 `parse_*` 之外的语义转换 |
| `core/protocol` | 业务决策：分组 / 排序规则 / 兜底策略（"未分类"兜底等属 BFF）；只允许形状映射 |
| `backend/data` 的 store/domain | 解析 HTML、感知 HTTP / GitHub（Data Server 自身的 HTTP adapter 例外） |
| `product`（除 data_client） | 直接访问 SQLite |

以上是当前边界，不是待治理清单。历史违规已从主文档移除；是否存在新违规以当前源码和架构门禁结果为准。

## 门禁要求

- 分层规则进入 `ops quality` 的 import / 模块依赖检查；
- 确需暂存违规时只能使用显式、可追踪的豁免；不得通过改路径、动态 import 或字符串拼接绕过；
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

Given 门禁生效且豁免清零

When 页面代码直接装配网络、存储或 wire DTO

Then 质量门禁失败

### SPEC-ARCH-BOUNDARY-001-002

Given `app/` 页面需要业务数据或宿主能力

When 页面发起读取、写入或访问浏览器能力

Then 页面通过 habitat API/resource 和注入的 ports；页面不直接装配 transport、存储或 wire DTO

### SPEC-ARCH-BOUNDARY-001-003

Given 任意后端变更

When 审查 `http.rs` 与 `wire.rs`

Then `http.rs` 无 BFF 决策（仅适配与分发调用）；`to_shelf` 类编排逻辑位于 product 的 BFF 模块；protocol 只含形状映射

### SPEC-ARCH-BOUNDARY-001-005

Given 门禁规则生效

When 新代码试图把编排逻辑写进 protocol 或让页面直接调 client

Then 评审与门禁双拦截（规则文件与架构文档一致）

### SPEC-ARCH-BOUNDARY-001-006

Given golden 清单与双端对照测试生效

When 新增 / 改动任一场景（endpoint × sceneCode）而清单未同步，或清单有项而任一端未实现

Then 对应测试失败（Rust 或 TS 侧红灯）

### SPEC-ARCH-BOUNDARY-001-007

Given 新代码位于 `src/frontend/app/`

When 它导入旧前端运行时，或 kernel/habitat 绕过各自依赖方向、bootstrap 之外直接装配宿主适配器

Then 架构门禁失败并报告具体文件与边界规则

## 边界与失败

- 新运行时的数据用例位于 habitat，宿主实现位于 `@fluvient-loom/web`/`node` 适配器包，抽象能力位于 kernel 与 `@fluvient-loom/port|common|query`；
- 与其他当前工作的写集冲突（`http.rs`、`wire.rs`、`client.ts`、各页面文件）：先完成契约和写集协调，再串行执行整改；
- 治理中发现“边界正确但实现腐化”的项：登记问题并另行明确范围，不在本 Spec 中隐式扩大改动；
- 门禁豁免清单是唯一合法的暂存违规形式，禁止新增未登记豁免。

## 测试/验收证据

- `app/` 运行时的边界由 `apps/blog/src/quality/architecture.ts` 及其正负样例测试守卫；规则文件中针对已删除旧路径的正则不再匹配任何文件，属待清理规则。文档不以历史计划代替当前扫描结果。
- 后端边界由 Rust 模块检查、契约测试和真实 Product→Data 链路测试共同覆盖；门禁规则覆盖 Product HTTP snapshot 聚合与分类后代计算、Data Cargo manifest 的 HTML parser 和外部 HTTP/GitHub client 依赖；API golden 同时由 Rust 生产路由/scene 契约和 TS client 实际调用测试对照。
- 历史通过结果（含历史 `ops quality check` 快照）不替代当前复跑；当前验收以现有 `ops quality check`、相关运行测试和用户产品确认共同决定。
