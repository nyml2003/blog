# @fluvient-loom/serde-web

`@fluvient-loom/serde` 的 web 端具体实现：把文本原料解析成校验器可读的结构，或把值序列化回文本。当前作为 workspace 私有包维护。

- `parseJsonText` / `serializeJson`：`JSON.parse` / `JSON.stringify` 的封装。
- `parseQueryString`：查询串 / `URL` → 无原型 Record（重复 key first-wins）；防被污染的环境经原型链渗入边界记录。
- `withSearchParams`：路径 + 参数 → 带查询串的路径（追加式，跳过 `undefined` 与空串）。

本包不含 schema，也不做方向绑定：schema、原料与解析/序列化函数都在 `@fluvient-loom/serde` 的调用点注入，绑定默认由各端 SDK 层决定。
