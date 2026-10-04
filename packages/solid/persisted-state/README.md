# @fluvient-loom/persisted-state

同步持久化 UI 状态的 Solid 响应式原语：把「存储读取 → 响应式值 → 写透传」收敛为一个经过测试的入口，业务侧只组合领域 parse 与动作。

## 契约

- `createPersistedRecord(persistence, options)`：创建时通过 `PersistencePort.read` 读取一次，`options.parse` 把原始字符串归一化为领域值（必须永不抛错，缺数据/损坏数据都返回可用默认值）。使用 `set(value)` 或 `update(updater)` 写入；`T` 即使是函数类型也不会与 updater 混淆。写入成功后才更新 signal，失败返回基于 `Result` 的错误并尝试回读；回读失败可通过 `readFailure()` 观察。
- `set`/`update` 返回 `Result<void, PersistedRecordFailure | PersistenceFailure>`；调用方必须决定如何呈现或记录写入、序列化和 updater 异常，不能把失败当成成功。
- `value()` 返回值按不可变数据使用，修改必须经过 `set`/`update`。需要按领域内容去重时可传 `equals(previous, next)`；判等为真时 signal 保留旧引用且不通知订阅者。
- 必须在页面 bootstrap 中同步创建（app scope）；禁止在依赖异步 props 或资源的组件内创建——初始化时序会变成 bug。
- 只依赖注入的 `PersistencePort`，不直接访问平台存储；序列化只认 string，与 `@fluvient-loom/port` 协议一致。

## 与 Codec/Persistence 原语计划的关系

序列化语义刻意与 `PLAN-FRONTEND-CODEC-PERSISTENCE-001` 已确认的铁律对齐（只认 string、永不抛错、normalize 可裁剪）。`@fluvient-loom/serde`（具体解析器在 `@fluvient-loom/serde-web`）已落地为媒介无关的 `decoder`/`encoder` 对象（`decode({ type, source, parser })`，解析器与 schema 都在调用点）：`parse`/`serialize` 若平移，需要在其上补出本包的"损坏即默认值"全量语义（codec 返回 `Result`）；响应式包装是否上收为共享原语届时另行决策。

## 开发

```sh
pnpm --filter @fluvient-loom/persisted-state test
ops package check
```
