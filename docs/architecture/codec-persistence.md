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
- Codec 做对象与字符串之间的纯转换；
- 编排层把业务意图转换为 `PersistPlan`；
- Port 只认 key 和 string；
- 存储实现只处理字节或宿主 API。

## 已落地原语

- `@fluvient/core`（`packages/ts/core`）：`ErrorInfo`、`SerializableFailure`、`SerializableResult`、`toErrorInfo`、`isJsonValue`、`isSerializableFailure`；`PersistencePort`、`NetworkPort`、`JsonRequester` 的失败返回已约束到 `SerializableResult`。
- `@fluvient-loom/codec`（`packages/ts/codec`）：`Codec<T>`、`createJsonCodec`、`CodecFailure`、`CodecHooks`、`CodecRejection`。
- `@fluvient-loom/port`（`packages/ts/port`）：`PersistPlan` 原语与 `write(plan)` 写入口。

## PersistPlan 契约

- 归属决策（2026-10-04）：演进 `@fluvient-loom/port`，不新建独立包——消费者（`web`、`node`、`query`、`command`、`persisted-state`、前端）全部从 port 消费，无独立发布需求。
- 字段：`key`、`value`（已是序列化结果）、预留 `version?`（领域版本号，未来条件写入或迁移）与 `createdAt?`（epoch ms，诊断用）；存储实现本轮可忽略预留字段。
- 批处理表示方式固定为 `readonly PersistPlan[]`，入口名预留 `writeBatch`，暂不落地（无消费者）。
- 写入口：`PersistencePort`/`AsyncPersistencePort` 均为 `write(plan: PersistPlan)`；旧 `write(key, value)` 一次性切换，无兼容期（消费者全部在 workspace 内）。

## Codec 契约

铁律：

- 只认 `string`；二进制另设 transport codec；
- `encode`/`decode` 全路径返回 `Result`，不得抛出；钩子抛出和 `JSON.parse`/`JSON.stringify` 异常一律转换为 `err`；
- `validate`/`normalize` 是可选钩子，Codec 本体不依赖 schema 库；zod 等由业务边界自行使用；
- `normalize` 可裁掉未知字段，避免旧数据被原样写回。

钩子调用顺序（固定，有单测锚定）：

- `encode = normalize → validate → serialize`：先把内存形态投影为持久化形态，validate 守卫的正是即将写入的内容；
- `decode = parse → validate → normalize`：validate 守卫原始线上形态，通过后 normalize 才把已验证的值投影回内存形态；因此 `normalize` 永不接触未经验证的任意输入。

`CodecFailure` 字段：`kind: "codec"`、`operation: "encode" | "decode"`、`stage: "normalize" | "validate" | "serialize" | "parse"`、`message`，可选 `code`（结构化拒绝透传）、`cause`（`toErrorInfo` 投影）。结构上是 `SerializableFailure` 成员，可用 `isSerializableFailure` 校验。

信任边界：无 `validate` 钩子时，`decode` 返回的 `T` 是对线上数据的信任式收窄（实现中的唯一显式收窄点）；接入方必须自带 `validate` 才能获得形态保证。

## 错误模型

- `Result<T, E>` 是控制流原语；跨 Port、Codec、Persistence 和 UI 边界的 failure DTO 使用 `SerializableResult` 约束；
- 原生 `Error`/`unknown` 只能在 catch 边界通过 `toErrorInfo` 转成纯对象；公开 failure 禁止携带原生 `Error`、Promise、函数、DOM、二进制对象或未验证的任意对象；
- 领域错误使用带 `kind` 的联合，不通过 class 继承表达差异。

## 读路径

缺数据返回领域默认值；`@fluvient-loom/port` 的 `read` 缺失语义是 `undefined`（`packages/web` 已在边界归一化 `localStorage` 的 `null`），本层不引入 `null`。

## 未决项

- 错误压扁点已全部关闭（2026-10-04）：`mobile-prefetch` 两端结果 DTO 已携带 `cause`；`cli-kit`/`page-build-kit` 的四处为书面例外（OPS 输出契约受 `SPEC-OPS-OUTPUT-001` 冻结 + 面向人的展示边界）。
- settings 迁移到 Codec/Persistence 栈不在本轮，`mobile-nav.tsx` 直写 `blog.mobile.theme` 是已知接入点。
