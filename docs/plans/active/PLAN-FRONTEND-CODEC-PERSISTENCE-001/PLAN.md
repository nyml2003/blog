---
kind: plan
id: PLAN-FRONTEND-CODEC-PERSISTENCE-001
status: partial
owner: project-manager
created: 2026-10-01
last_reviewed: 2026-10-04
---

# Codec/Persistence 原语包抽取

## 目标

把已经确定的持久化分层落成可独立验收的 workspace 原语：业务类型、Codec、编排、Port、存储实现各自有清楚边界。本轮先交付共享原语和契约，settings 等业务接入后置。

本轮交付：

1. 在现有 `@fluvient/core`（`packages/core`）基于已有 `Result` 增加 `ErrorInfo`、`SerializableFailure`、`SerializableResult`、`toErrorInfo` 和 `isSerializableFailure`；
2. 新建 `@fluvient-loom/codec`，实现 `Codec<T>`、`createJsonCodec`、`CodecError` 及可复制的单测模板；
3. 在 persistence 归属闸门通过后落地 `PersistPlan` 和对应 Port 原语；
4. 为序列化不进入 Port、`PersistPlan`、Codec 只认 string、错误联合和读缺省返回默认值建立 ADR；
5. 收敛当前已发现的错误压扁点：原语必须有消费侧，未知 `cause` 必须转换为可序列化 `ErrorInfo`，不能把原生 `Error` 放进跨边界 `Result`。settings 迁移本身不在本轮。

## 计划价值

- **降低接入风险**：后续 settings 只组合领域模型、Codec 和 Port，不再重复实现 JSON 解析、默认值和存储异常处理。
- **固定跨包协议**：`Codec` 和 `PersistPlan` 先独立验收，避免业务接入时同时改变 `port`、`web` 和页面代码。
- **保留故障证据**：当前多个边界把异常压成字符串，调用方丢失错误名、错误码和错误链；统一的可序列化投影后，日志、重试和上层错误映射可以保留上下文，同时不会把运行时对象泄漏到 Port、Codec 或 UI 进程。
- **控制架构漂移**：ADR 把本轮取舍写成可追溯事实，后续新增存储实现或业务接入不必重新解释分层边界。

## 当前执行记录（2026-10-04）

本次已交付：

- 新建 `@fluvient-loom/codec`（`packages/ts/codec`，按分类目录新布局落位，plan 原文的 `packages/codec` 路径已由 workspace 现状取代）：`Codec<T>`、`createJsonCodec`、`CodecFailure`、`CodecHooks`、`CodecRejection`。9 个单测覆盖 round-trip、非法 JSON、循环引用、`JSON.stringify` 返回 `undefined`、`validate` 双侧拒绝（字符串与结构化）、`normalize` 裁剪、钩子顺序锚定和异常钩子注入。
- 固定 Codec 契约（闸门 3）：`encode = normalize → validate → serialize`、`decode = parse → validate → normalize`；`CodecFailure` 带 `operation`/`stage`/`code?`/`cause?`，结构上是 `SerializableFailure` 成员；无 `validate` 钩子时 decode 是信任式收窄，接入方必须自带 validate。
- ADR 落地（闸门 5）：`docs/architecture/codec-persistence.md` + 架构索引入口；已生效契约与未决决策分开记录。产品评审尚未进行。
- **Persistence 归属闸门通过（闸门 1）**：决策为演进 `@fluvient-loom/port`，不新建独立包。理由：现有 `web`、`node`、`query`、`command`、`persisted-state` 和前端全部从 port 消费，无独立发布需求。
- **`PersistPlan` 落地（闸门 2）**：`PersistPlan { key, value, version?, createdAt? }`，`version`/`createdAt` 为预留字段，本轮存储实现忽略；批处理表示方式固定为 `readonly PersistPlan[]`（入口名预留 `writeBatch`，本轮不落）。`PersistencePort`/`AsyncPersistencePort` 写入口切换为 `write(plan: PersistPlan)`，无兼容期（消费者全部在 workspace 内，一次性迁移）。迁移面：port 接口与 `asAsyncPersistence`、web `localStorage` 适配器、node 内存适配器、`persisted-record`、settings（persistence.ts、model.ts）、`mobile-nav.tsx`、`navigator-icons.tsx` 及对应测试、`apps/blog/test/packages/package-smoke.ts`。
- 验证（并发环境下的直接调用，避开 `pnpm` 自动 install）：`tsc --noEmit` 通过；codec 9/9、port 5/5、web 19/19、node 10/10、persisted-state 12/12、command 12/12、package smoke 1/1 全部通过；`ops package check` 在并发开始前曾全绿（platform neutrality guard、package smoke、pnpm check，退出码 0）。

已知遗留与外部状态：

- `apps/blog/test/` 不在根 tsconfig include 内，`package-smoke.ts` 等文件不参与 typecheck（本次签名切换的漏网点即源于此）。曾尝试纳入 include，但该目录存在多处与本计划无关的既有类型错误，已回退，仅在此记录。
- 本轮执行期间有另一工作流并发操作同一工作树（desktop 页面抽取，`packages/app/pages/desktop-*` 与 `src/frontend/package.json` 引用 `@fluvient-loom/mobile-h5-solid-atoms`）。恢复 stash 时对 `page-kit/shared.ts`、`src/frontend/package.json`、`pnpm-lock.yaml` 做了双方内容合并；截至本轮结束时，对方 `frontend/package.json` 引用的 atoms 新包名尚未在工作区存在，`pnpm install` 会失败——属于对方工作流的中间态，不是本计划引入的失败。
- `ops quality check` 的 lint/format 失败为 HEAD 既有漂移（如 `navigator-icons.tsx` 未触及区域的格式问题），与本计划改动无关；本计划未引入新的 lint/format 失败。

错误压扁点迁移（2026-10-04 第二批，闸门 4）：

- **已迁移（6 处，均补 `cause?: ErrorInfo`，message 与用户可见行为不变）**：`desktop-api`（`DesktopApiFailure` + `mapRejected`/execute 透传 `response.error.cause`）；`foundation/api`（`MobileApiFailure` + 同上）；`detail/model.ts`、`pages/settings/page.tsx` 的 `mapRejected`；settings 链路（`MobileSettingsError` + persistence/model 全部失败路径透传）；`validation/wasm.ts`（`HtmlInspectionFailure` 两处）。均为可选字段的增量变更，不影响消费者。
- **已合格（5 处，message 压扁但 `cause: toErrorInfo` 并存）**：`net/network.ts` ×2、`core/http/error.ts`、`query/task.ts`、`web/persistence.ts`。
- **书面例外（4 处）**：`cli-kit/errors.ts` ×2 与 `entry.ts`——OPS 输出契约受 `SPEC-OPS-OUTPUT-001` 冻结且 stderr 为人类可读展示边界；`page-build-kit/scaffold.ts`——脚手架 issues 是面向人的报告。
- **延后后已补齐（2 处）**：`mobile-prefetch`（service-worker + client）在并发工作流收尾、`pnpm install` 恢复后完成迁移——`MobilePrefetchResult` 补 `cause?: ErrorInfo`，包新增 `@fluvient/core` 依赖，MessageChannel 两端均经 `toErrorInfo` 附加 cause；守卫与既有测试不受影响。
- 验证：根 typecheck 与 `src/frontend` typecheck 均 0 错误；api/settings 21/21、desktop admin/kernel/source-layout 20/20 通过；补齐后 `ops package check` 全绿（platform neutrality guard、package smoke、pnpm check，退出码 0），frontend api/settings/admin 33/33。

错误压扁点清单至此全部关闭：6 迁移 + 2 补齐 + 5 合格 + 4 书面例外，无遗留。

尚未交付：ADR 产品评审和 settings 接入。

## 历史执行记录（2026-10-02）

本次已交付：

- `@fluvient/core` 新增 `ErrorInfo`、`SerializableFailure`、`SerializableResult`、`toErrorInfo`、`isJsonValue` 和 `isSerializableFailure`；`Error` 的 cause 会被投影为有限的纯对象，默认不传播 stack，并处理循环与深度上限。
- `PersistencePort`、`NetworkPort`、`JsonRequester` 的失败返回改用 `SerializableResult`；web persistence、HTTP/network、query task 的已知异常路径会附带可序列化 `cause`。
- 移除本计划原先的 `LoomError`/`createError` 目标；内部 `DataTask` 等编排泛型继续通用，避免把本地测试错误误当成跨边界协议。

尚未交付：Codec 包、`PersistPlan`、ADR、剩余错误压扁点的逐项迁移和 settings 接入。当前证据为 core、web、net、query 相关测试通过，以及 workspace `pnpm typecheck` 通过；全量质量门禁和浏览器验收尚未执行。

## 已确认的设计输入

以下是实现约束，不在本计划内重新讨论：

- **分层边界**：业务只认领域类型；Codec 做对象与字符串之间的纯转换；编排层把业务意图转换为 `PersistPlan`；Port 只认 key 和 string；存储实现只处理字节或宿主 API。
- **Codec 铁律**：只认 `string`，二进制另设 transport codec；`encode`/`decode` 全部返回 `Result`，不得抛出；`validate`/`normalize` 是可选钩子，不把 schema 库放进 Codec 本体；`normalize` 可裁掉未知字段，避免旧数据被原样写回。
- **PersistPlan**：Port 的写入口使用 `write(plan: PersistPlan)`，为版本、时间戳和批处理预留；序列化不放进 Port。
- **错误模型**：`Result<T, E>` 仍是控制流原语；具体跨 Port、Codec、Persistence 和 UI 边界的 failure DTO 使用 `SerializableResult` 约束，运行时用 `isSerializableFailure` 校验不可信输入。原生 `Error`/`unknown` 只能在 catch 边界通过 `toErrorInfo` 转成纯对象。内部编排泛型可以暂时保持通用，但不得把原生 `Error` 暴露给公开协议。领域错误使用带 `kind` 的联合，不通过 class 继承表达 settings、codec、persistence 的差异。
- **编排层**：使用纯函数；`prepare` 通过 `Result` 返回计划，不 reject；`execute` 与 `compensate` 共用 `applyPlan`。
- **读路径**：缺数据返回领域默认值；产品语义变化时只修改该处。
- 方案中的 settings 字段只是示例；未来接入使用真实模型（paper/dark/sepia + font）和真实 key（含 legacy 迁移）。

## 当前基线（2026-10-02 复核）

- 共享原语包是 `@fluvient/core`，目录为 `packages/core`；它已有 `Result`、`DeepReadonly`、`resource`、`cancellation` 和 `/http`，本轮新增可序列化错误投影，不新增全局错误 class。
- `@fluvient-loom/query` 仍是独立包，未与 `@fluvient/core` 合并；`packages/common` 不存在。所有写集和依赖名以当前 workspace 为准。
- `@fluvient-loom/port` 已有 `PersistencePort`、`AsyncPersistencePort` 和 `PersistenceFailure`；当前 `read` 返回 `string | undefined`，`packages/web` 已将 `localStorage` 的 `null` 在边界归一化为 `undefined`。本轮不再把 `string | null` 作为待决语义。
- 边界归一化计划已归档并完成，且明确保持 `@fluvient-loom/port`/`web` 协议不变；本计划应把它视为前置结果，不再引用为 active 依赖。
- settings 已拆到 `src/frontend/mobile/features/settings/`，当前 `mobile-nav.tsx` 仍直接写 `blog.mobile.theme`，属于后续接入迁移的已知事项。
- 错误压扁扫描基线不是“至少 5 处”：当前至少有 12 个相关点，包含 `cause instanceof Error ? cause.message : ...` 和 `String(error)` 路径，分布在 `src/frontend`、`packages/query`、`packages/web`、`packages/core/http`、`packages/net` 和 `packages/mobile-prefetch`。实现前需按错误契约逐处分类，不能只修原先列出的 5 个前端点。
- 本计划尚未取得新的 `ops package check` 结果；执行时必须记录新包检查结果，并区分已有 workspace/lockfile 或中立性护栏失败与本计划引入的失败。

## 本轮范围与非目标

本轮范围：

- `packages/core` 的可序列化错误原语，并把公开跨边界 failure 逐步约束到 `SerializableResult`；
- 新建 `packages/codec`；
- persistence 原语及其归属、签名和兼容路径的决策与实现；
- 错误压扁点的逐处消费改造，保持用户可见文案和业务结果不变；
- ADR、测试和交付证据。

非目标：

- 不把 settings 迁移到 Codec/Persistence 栈，不改真实 settings 领域模型和 legacy 迁移流程；
- 不在未通过闸门前修改现有 `PersistencePort` 签名或 `packages/web` 行为；
- 不发布 npm，不做二进制 Codec，不把 zod 或其他 schema 库作为 `@fluvient-loom/codec` 的运行时依赖；
- 不定义新的错误码体系，不改 `SPEC-OPS-OUTPUT-001`；
- 不改变用户可见业务行为。错误对象可增加 `cause`，但 message、Result 成功/失败语义和页面流程保持不变。

## 决策闸门

1. **Persistence 归属**：默认优先演进 `@fluvient-loom/port`，因为现有 `web`、`node`、`query`、`command` 和前端都从这里消费；只有需要独立发布、独立依赖或不同演进节奏时才新建 `@fluvient-loom/persistence`。决策记录需列出消费者、迁移面和兼容策略。
2. **PersistPlan 契约**：在 ADR 中写明 plan 的字段、版本/时间戳是否可选、批处理表示方式、同步/异步 Port 的对应签名，以及旧 `(key, value)` 实现如何过渡。本轮不以 `null` 作为缺失语义，读缺省统一沿用现有 `undefined` 边界。
3. **Codec 契约**：在编码前固定 `Codec<T>`、`createJsonCodec`、`CodecError` 的字段和 `validate`/`normalize` 调用顺序；本轮不提供 zod 适配示例，zod 继续由业务边界自行使用。
4. **错误保真度范围**：逐处处理基线扫描出的 12 个错误压扁点；若某处必须只保留字符串，需在结果记录中写明边界理由和测试证据。公开 failure 只能携带 `ErrorInfo` 等纯数据，禁止携带原生 `Error`、Promise、函数、DOM、二进制对象或未验证的任意对象。
5. **ADR 位置**：新建 `docs/architecture/codec-persistence.md`，采用现有架构文档的 Markdown 形式并带 `kind`、`id`、`status`、`date` 元数据；同步在 `docs/architecture/README.md` 增加入口。

## 成功标准

1. `@fluvient/core` 提供 `ErrorInfo`、`SerializableFailure`、`SerializableResult`、`toErrorInfo`、`isJsonValue` 和 `isSerializableFailure`；未知抛出值、cause 循环和深度上限均有测试，公开 failure 不携带原生 `Error`；现有 core、port、query、web、node、net 及前端 typecheck/test 不回归。
2. `@fluvient-loom/codec` 的 `encode`/`decode` 所有路径返回 `Result` 不抛出；异常注入、非法 JSON、`validate` 拒绝、`normalize` 裁剪和 `JSON.stringify` 返回 `undefined` 均有单测。
3. persistence 闸门形成书面决策；选定包提供 `PersistPlan` 和对应 Port 原语；现有消费者的迁移路径、兼容期和不迁移部分明确记录。
4. 错误压扁清单逐项关闭或有书面例外；未知 `cause` 不被无理由丢弃，用户可见 message 和业务结果保持不变。
5. ADR 覆盖所有已确认取舍并完成产品评审；不再以对话留档作为唯一事实源。
6. 新包通过 `ops package check` 的相关步骤；跨共享包改动补跑 `ops quality check`，失败项按基线与本计划引入项区分。
7. 不导入新 Codec/Persistence 包到 settings 或页面，前端构建和运行行为保持不变。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 基线清单与错误点分类 | frontend+qa | - | 本计划执行记录或 `RESULT.md` | ready |
| core 可序列化错误原语 | frontend | - | `packages/core/src/`、`packages/core/test/` | completed |
| codec 包实现与单测 | frontend | core 错误原语的类型/错误约定 | `packages/ts/codec/`（新建） | completed |
| ADR 起草 | frontend+pm | - | `docs/architecture/codec-persistence.md`、架构索引 | completed（产品评审待做） |
| Persistence 归属与契约闸门 | 产品+pm | 基线清单、codec 契约草案 | 本计划决策记录 | completed（决策：演进 port） |
| persistence 原语落地 | frontend | 闸门通过 | `packages/ts/port/` | completed |
| 错误消费改造 | frontend | core 错误原语、错误契约 | 清单中列出的 `src/`、`packages/` 文件及测试 | completed |
| 收尾与移交 | pm | 全部工作流、质量证据 | `RESULT.md`、后续 settings 接入说明 | pending |

## 验收证据

1. Codec 对循环引用、非法 JSON 和异常钩子注入返回 `err`，并能断言原始 `cause`；
2. 共享包消费者和前端 typecheck/test 通过；`ops package check`、必要的 `ops quality check` 结果带命令、退出码和已知基线失败；
3. 前端构建产物和运行行为无用户可见变化；本轮不以“未 import 新包”替代错误消费改造的证据；
4. ADR 的取舍、Persistence 迁移路径、错误点清单和例外理由均可从仓库文件追溯。

## 决策记录

- **2026-10-04（Standard Schema 修订）**：codec 的校验入口从手写 `validate` 钩子改为 **Standard Schema v1** 结构接口，类型在包内内联（不引入 `@standard-schema/spec` 依赖，中立性 guard 与 lockfile 不变）；schema 必填，信任边界用宽松 schema 表达；**encode 不重跑 schema**（带 transform 的 schema 会对已投影值二次变换）；新增 URL 媒介 `parseSearchParams` / `withSearchParams`；移除 `CodecRejection` 与 `CodecFailure.code`，新增 `CodecFailure.issues`。本条取代"已确认的设计输入"中 Codec 铁律的手写钩子表述、非目标中"不提供 zod 适配"的表述，以及闸门 3 的钩子顺序固定项。证据：`packages/ts/codec/`（17 项单测 + 编译期兼容夹具），`ops package check` 通过（中立性 guard / smoke / workspace typecheck+test，退出码 0）。
- **2026-10-04（使用体验修订，取代上一条的 API 形态；设计原则不变）**：包改为媒介无关的 `decoder` / `encoder` / `codec` 三个常量对象；schema 从工厂移到调用点——`decode({ type, source, parser })`、`encode({ value, serializer, normalize? })`，**请求字段全部必填、包内零默认**，绑定默认留给各端 SDK 层；json / search-params 降级为具名解析器实现（`parseJsonText` / `serializeJson` / `parseQueryString`），移除 `createJsonCodec` / `parseSearchParams` / `CodecHooks` / `Codec<T>`；解析函数抛出归一为 stage `"parse"`（URL 媒介同样可能产生该 stage）；`parseQueryString` 保留无原型记录与 first-wins 语义。证据：`packages/ts/codec/`（19 项单测 + 编译期兼容夹具），`pnpm typecheck` 通过。
- **2026-10-04（改名与拆分）**：`@fluvient-loom/codec`（`packages/ts/codec`）更名为 **`@fluvient-loom/serde`**（`packages/ts/serde`），只保留接口、机制与 Standard Schema 声明；具体媒介实现移入新包 **`@fluvient-loom/serde-web`**（`packages/web/serde-web`，`parseJsonText` / `serializeJson` / `parseQueryString` / `withSearchParams`），serde-web 以 workspace 依赖引用 serde 的 `Parser` / `Serializer` 契约（编译期夹具锚定）。概念名（`Codec` / `CodecFailure` / 请求类型）不变。证据：serde 11 项 + serde-web 12 项单测通过，`pnpm typecheck` 与 `ops package check` 通过（退出码 0）；`pnpm-lock.yaml` 的 importer 变更仅限这两个包。
- **2026-10-04（标识符改名）**：代码标识符全套对齐包名（取代上一条"概念名不变"的表述）——`CodecFailure` → `SerdeFailure`（`kind: "serde"`）、`Codec` → `Serde`、`codec` 常量 → `serde`、`src/codec.ts` → `src/serde.ts`、`test/codec.test.ts` → `test/serde.test.ts`；`Decoder` / `Encoder` / `Parser` / `Serializer` / 请求类型不含 codec 字样，不变。架构文档只更新标识符引用，ADR 文件名、标题与 id 不动（持久化分层的架构记录）。证据：serde 11 项 + serde-web 12 项单测、`pnpm typecheck` 通过。
- **2026-10-04（URL 参数消费点迁移，删除 `@blog/route-input`）**：`page-kit` 的 `definePage` 新增 `params`（Standard Schema，schema 库由页面包自选，当前用 zod）并产出 `parseParams(search)`——惰性解析、返回 `Result<输出, SerdeFailure>`；7 个页面在 `definition.ts` 声明参数 schema、按结果消费，逐条保留既有行为（detail/admin 的 invalid 态、desktop-articles 的 `"all"` 哨兵、desktop-editor 的 `?? 0` 新建哨兵、`q` 的 trim 语义）；`displayDate` 移入 `@blog/mobile-shared`（含 `./date` 子路径出口，node 测试不拉 CSS 链）；两份 `searchQuery` 随各页 `q` 字段收口。证据：`pnpm typecheck`、`blog-web test:mobile`（22 项）、`test:frontend`（48 项）、`page:check`（17 页 / 22 alias 与投影一致）通过。
- 未交付（本轮范围外）：`categoryHref` 写侧、desktop-api / mobile-api 手写 `safeParse`、`persisted-state` 的 `parse`/`serialize` 平移。

## 未决项

- Persistence 原语继续演进 `@fluvient-loom/port`，还是新建独立包；
- `PersistPlan` 的最小字段和旧 Port 的兼容过渡方式；
- `Codec<T>`/`CodecError` 的最终字段和钩子顺序（2026-10-04 已决，见"决策记录"）；
- 各错误消费者公开 failure 的 `kind`、`code`、`details` 和 `cause` 最小字段；
- ADR 产品评审结论；
- npm 发布时机（沿用既有基础设施包收尾记录）。
