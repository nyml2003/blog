---
kind: architecture
id: ARCH-CODEC-PERSISTENCE
status: current
owner: frontend
last_reviewed: 2026-10-04
---

# Codec/Persistence 架构

依据：[PLAN-FRONTEND-CODEC-PERSISTENCE-001](../plans/active/PLAN-FRONTEND-CODEC-PERSISTENCE-001/PLAN.md)。本文记录当前已生效的分层与契约；未决决策单列一节，不与已生效内容混排。

## 分层边界

- 业务只认领域类型；
- Codec 做对象与文本媒介之间的纯转换（JSON 文本、查询串）；
- 编排层把业务意图转换为 `PersistPlan`；
- Port 只认 key 和 string；
- 存储实现只处理字节或宿主 API。

## 已落地原语

- `@fluvient/core`（`packages/ts/core`）：`ErrorInfo`、`SerializableFailure`、`SerializableResult`、`toErrorInfo`、`isJsonValue`、`isSerializableFailure`；`PersistencePort`、`NetworkPort`、`JsonRequester` 的失败返回已约束到 `SerializableResult`。
- `@fluvient-loom/serde`（`packages/ts/serde`）：媒介无关的 `decoder` / `encoder` / `serde` 对象与请求类型（`DecodeRequest` / `EncodeRequest`）、`SerdeFailure`，以及内联的 Standard Schema v1 结构声明（`StandardSchemaV1`）——零媒介实现、零解析器默认。
- `@fluvient-loom/serde-web`（`packages/web/serde-web`）：具体媒介实现 `parseJsonText` / `serializeJson` / `parseQueryString` / `withSearchParams`，注入 serde 的调用点使用。
- `@fluvient-loom/port`（`packages/ts/port`）：`PersistPlan` 原语与 `write(plan)` 写入口。

## PersistPlan 契约

- 归属决策（2026-10-04）：演进 `@fluvient-loom/port`，不新建独立包——消费者（`web`、`node`、`query`、`command`、`persisted-state`、前端）全部从 port 消费，无独立发布需求。
- 字段：`key`、`value`（已是序列化结果）、预留 `version?`（领域版本号，未来条件写入或迁移）与 `createdAt?`（epoch ms，诊断用）；存储实现本轮可忽略预留字段。
- 批处理表示方式固定为 `readonly PersistPlan[]`，入口名预留 `writeBatch`，暂不落地（无消费者）。
- 写入口：`PersistencePort`/`AsyncPersistencePort` 均为 `write(plan: PersistPlan)`；旧 `write(key, value)` 一次性切换，无兼容期（消费者全部在 workspace 内）。

## Codec 契约

形态（2026-10-04 第二次修订）：包提供媒介无关的 `decoder` / `encoder` / `serde` 三个对象，**请求自携全部输入，包内零默认**：

- `decode({ type, source, parser })`：`type` 是 Standard Schema，`source` 是原料，`parser` 是注入的解析函数，三者必填；
- `encode({ value, serializer, normalize? })`：`serializer` 必填，`normalize` 是可选纯投影；
- 本包不绑定任何媒介解析器/序列化器，也不做回退；json / search-params 只是包内提供的具名实现，**绑定默认留给各端 SDK 层**。

铁律：

- 只认文本原料与 `string` 结果；二进制另设 transport codec；
- 全路径返回 `Result`，不得抛出；注入函数抛出、schema 抛出/拒绝一律转换为 `err`；
- 校验由 **Standard Schema v1**（`~standard.validate`）承担：类型是包内内联的结构声明，不引入 `@standard-schema/spec` 依赖，也不绑定任何 schema 库；zod、valibot 等实现因结构兼容可直接使用，换库不改公共接口；
- schema 必须同步：`decode` 全路径同步返回，schema 返回 thenable 视为接入错误；
- 解析函数抛出 → stage `"parse"`；schema 失败 → stage `"validate"`。

调用顺序（固定，有单测锚定）：

- `decode = parser(source) → schema`：解析由注入函数完成，其输出交给 schema，校验与投影（transform/strip）都由 schema 完成，`T` 即 schema 的输出类型；
- `encode = normalize → serializer`：**encode 不跑 schema**（2026-10-04 决策）——带 transform 的 schema 会对已投影的值二次变换（decode `"a"` → `"a!"`，encode 再变成 `"a!!"`），静默写坏比不校验更糟；写入形态由 `normalize` 与调用方负责。

`SerdeFailure` 字段：`kind: "serde"`、`operation: "encode" | "decode"`、`stage: "normalize" | "validate" | "serialize" | "parse"`、`message`，可选 `issues`（schema 拒绝的逐条问题，路径 + 消息，`message` 取第一条）与 `cause`（`toErrorInfo` 投影）。结构上是 `SerializableFailure` 成员，可用 `isSerializableFailure` 校验。

## 媒介解析器

以下实现位于 `@fluvient-loom/serde-web`，由调用方注入 serde 的请求；serde 本体不含任何解析器：

- `parseJsonText` / `serializeJson`：`JSON.parse` / `JSON.stringify` 的封装。
- `parseQueryString`（search-params）：字符串按查询串解释（前导 "?" 由 `URLSearchParams` 剥离），完整 URL / 路径传 `URL` 实例或调用方自取 `url.search`；重复 key first-wins（对齐 `URLSearchParams.get`）；记录原型为 null——防止被污染的环境（`Object.prototype` 上的注入）经原型链渗入边界记录（校验器用属性访问读取）。宿主需要别的策略时整体替换该解析器。
- `withSearchParams`：URL 写侧（追加式、跳过 `undefined` 与空串）。写方向无法由 schema 驱动（Standard Schema 没有内省能力），保持独立纯函数，不套 `encoder`。

## 错误模型

- `Result<T, E>` 是控制流原语；跨 Port、Codec、Persistence 和 UI 边界的 failure DTO 使用 `SerializableResult` 约束；
- 原生 `Error`/`unknown` 只能在 catch 边界通过 `toErrorInfo` 转成纯对象；公开 failure 禁止携带原生 `Error`、Promise、函数、DOM、二进制对象或未验证的任意对象；
- 领域错误使用带 `kind` 的联合，不通过 class 继承表达差异。

## 读路径

缺数据返回领域默认值；`@fluvient-loom/port` 的 `read` 缺失语义是 `undefined`（`packages/web` 已在边界归一化 `localStorage` 的 `null`），本层不引入 `null`。

## 未决项

- 错误压扁点已全部关闭（2026-10-04）：`mobile-prefetch` 两端结果 DTO 已携带 `cause`；`cli-kit`/`page-build-kit` 的四处为书面例外（OPS 输出契约受 `SPEC-OPS-OUTPUT-001` 冻结 + 面向人的展示边界）。
- settings 迁移到 Codec/Persistence 栈不在本轮，`mobile-nav.tsx` 直写 `blog.mobile.theme` 是已知接入点。
