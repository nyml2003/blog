---
kind: spec
id: SPEC-ARCH-BOUNDARY-001
status: draft
owner: backend
plan_id: PLAN-ARCH-BOUNDARY-001
last_reviewed: 2026-09-08
---

# 架构分层边界规则（前端查询层归一 / 后端四层各归其位）

## 目标

将两条分层原则成文并自动化执行：前端"页面只管 UI 编排，数据获取归数据层（查询层）"；后端"HTTP 只管协议适配，编排归 BFF 层，protocol 是纯契约，Data 是类型化事务域"。边界违规由质量门禁拦截。架构迁移本身保持既有契约与行为不变；同轮另行授权的 T 型货架功能不属于该零变化对照集。

## 非目标

- 不重构任何内部实现（SQL 写法、算法、组件内部结构、命名）；
- 不改任何公开契约与可观察行为（API、wire、页面行为全部不变，以既有测试为护栏）；
- 不新增功能；不处理性能优化；
- 不动 `mobile-ui` / `desktop` 既有 UI 边界规则（已有契约继续有效）。

## 前端分层规则

```text
组合根（页面入口 tsx）   transport 装配（browserClient / mock-session）
页面（*/pages/**）       只做 UI 编排与页面本地 UI 状态
查询层（R0 定稿位置）    页面语义用例 hooks：参数映射 / fallback / 错误语义 / 数据整形
common/client            唯一协议出口（端点 → DataTask）
common/data + solid/data 机制层：transport / task / resource / adapter
```

**禁令（门禁断言）**：

| 层 | 禁止 |
| --- | --- |
| 页面 | import `common/client`、`solid/data`、`common/data`（组合根入口文件白名单例外：仅 transport 装配） |
| 业务组件 / 分子 / 原子 | import `common/client`、`common/data`（既有规则重申） |
| 查询层 | import 任何 UI / 页面 / 组件模块 |
| `common/client` | import Solid / DOM（保持框架无关） |

现状违规实例（2026-09-06 审得，治理对象）：`desktop/src/pages/admin/editor.tsx` 内联组装 `saveDraft` body；两端 `articles` 页各自维护 filter→query 参数映射；`mobile detail.tsx` 现场 `createDataTask` 拼兜底；mock-session 组合逻辑渗入页面入口。

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

现状违规实例（治理对象）：`product/src/http.rs` 混合路由 + 参数解析 + scene 分发 + 货架 BFF 决策（`has_filters` / `include_recommendation`）+ 日志文案；`core/protocol/src/wire.rs` 的 `to_shelf` 承载分组、分区排序与"未分类"兜底（编排行为住在契约 crate）。

## 门禁要求

- 分层规则进 `ops quality`：import / 模块依赖检查（mobile-ui 已有依赖边界检查先例，推广为全局机制）；
- 门禁上线时存量违规以**显式豁免清单**登记（带治理目标轮次），逐轮清零；豁免清零后规则全量生效；
- 检查规则本身有测试（改坏规则文件会红）。

## API 路由契约单一清单（golden）

现状同一契约存在三份手抄：`http.rs` 路由与 sceneCode 分发、`scene.rs` 常量、`client.ts` 的 path/sceneCode 硬编码。收敛方式：

- 一份中性 golden 清单声明 `endpoint × sceneCode × method` 全集（位置与格式由 R0 定，倾向 `docs/api/` 下可被双端测试读取的文件）；
- Rust 测试：清单条目全部被 http 分发覆盖、`scene.rs` 常量与清单一致；
- TS 测试：`client.ts` 全部方法的 path/sceneCode ⊆ 清单；
- 不做双语言 codegen（低依赖取舍，见计划决策记录）；
- 与 `SPEC-CONTENT-GITHUB-TRUTH-001` 的管理协议冻结协调：其新增管理 sceneCode 一并入 golden 清单，REPO-CONTRACT 交付的协议表与本清单为同一事实。

## 场景

### SPEC-ARCH-BOUNDARY-001-001

Given 门禁生效且豁免清零

When 页面代码 import `common/client` 或 `solid/data`

Then 质量门禁失败

### SPEC-ARCH-BOUNDARY-001-002

Given 查询层就位

When 页面需要数据

Then 页面只 import 查询层 hooks；参数映射、fallback（如无效 ID 的错误任务）、错误语义均在查询层，页面零数据装配代码

### SPEC-ARCH-BOUNDARY-001-003

Given 后端治理完成

When 审查 `http.rs` 与 `wire.rs`

Then `http.rs` 无 BFF 决策（仅适配与分发调用）；`to_shelf` 类编排逻辑位于 product 的 BFF 模块；protocol 只含形状映射

### SPEC-ARCH-BOUNDARY-001-004

Given 治理全程

When 每轮迁移完成

Then 公开 API、wire 响应、页面行为与迁移前一致（既有 product/mock/前端测试全绿），无行为性改动混入

### SPEC-ARCH-BOUNDARY-001-005

Given 治理完成

When 新代码试图把编排逻辑写进 protocol 或让页面直接调 client

Then 评审与门禁双拦截（规则文件与架构文档一致）

### SPEC-ARCH-BOUNDARY-001-006

Given golden 清单与双端对照测试生效

When 新增 / 改动任一场景（endpoint × sceneCode）而清单未同步，或清单有项而任一端未实现

Then 对应测试失败（Rust 或 TS 侧红灯）

## 边界与失败

- 查询层具体落位（`solid/data` 扩展 / `common/data` 下新模块 / 每端自建）由 R0 审查定稿并**报用户审定**；
- 与在途计划的写集冲突（`http.rs`、`wire.rs`、`client.ts`、各页面文件）：治理的整改轮次排在对应计划归档或写集交接之后，串行执行；
- 治理中发现"边界正确但实现腐化"的项：登记不动手，另立计划；
- 门禁豁免清单是唯一合法的存量违规存在形式，禁止新增未登记豁免。

## 测试/验收证据

- R0 审查：`AUDIT-REPORT.md` 按当前代码重核前后端违规、目标层与写集；查询层定稿为 `src/frontend/solid/queries/`。
- 前端：两端全部页面零 `common/client` / `common/data` / `solid/data` import；查询层测试覆盖参数归一、无效 ID、URL 筛选、乱序响应丢弃、分页、分类 history 和管理命令编排。前端 typecheck、lint、format、107 项核心测试与 build 通过。
- 后端：Mobile/T 型货架编排位于 Product/Mock `bff/`，HTTP 保留协议适配，protocol 只保留契约与纯映射；workspace fmt、clippy 和 tests 通过，Product/Mock 契约及真实 Product→Data 链路通过。
- 门禁：架构规则 9 项正负样例通过，仓库扫描零违规、零豁免；规则覆盖 Product HTTP
  snapshot 聚合与分类后代计算、Data Cargo manifest 的 HTML parser 和外部
  HTTP/GitHub client 依赖；38 条 API golden 同时由 Rust 生产路由/scene 契约和 TS
  client 实际调用测试对照。
- 总门禁：2026-09-08 `ops quality check` 全部通过；06:56（Asia/Shanghai）基于当前源码
  重建 integration 后 Desktop/Mobile T/F 代表路径的 52 项浏览器脚本连续两次通过，
  页面错误 0。
- 人工验收：代码与自动化证据已齐，最终产品验收由用户执行。
