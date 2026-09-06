# Rust workspace 集成契约

`PLAN-OPS-RUNTIME-DEV-001` 正在拥有根 `Cargo.toml`、`crates/` 和 Rust migrations 的 write set。HTML 校验 workstream 不并行写入该范围；正式 workspace 建立后由其 backend owner 创建以下 crate，并消费本目录的 v1 fixture。

## Crate 归属

- `article-html-core`：零 HTML parser/sanitizer 依赖的纯 Rust library；拥有 tokenizer、AST、source span、strict fragment parser、Profile validator 和领域诊断。不得依赖 axum、SQLx、DOM 或前端类型。
- `article-html-wasm`：只负责把 core 的 inspection 结果映射为稳定 JS 数据；不得复制 Profile 规则，不返回 AST 给业务页面。
- Product application/domain：原生调用 `article-html-core`。创建/更新草稿返回文章和 inspection；发布必须在状态写入前校验并拒绝 error diagnostics。
- Data Server：只持久化原始正文和文章状态，不判断 HTML 规则；Product 不得把校验下推成 SQLite 或 Data 的重复规则。

## 复杂度与线程

校验是 CPU 工作，但单篇输入被限制为 256 KiB，parser/validator 必须线性扫描。正常管理请求可在 Product application 路径同步调用；基准显示其足以阻塞 Tokio `current_thread` 的事件循环时，再通过有界 CPU worker 隔离。不能未经测量就为每次校验创建线程，也不能把 HTML 规则放入 Data 的 CPU worker 以破坏领域归属。

## 构建与验收顺序

1. 根 workspace 与 Product/domain crate 边界稳定。
2. `article-html-core` 消费 `fixtures/article-html-v1.json`，完成 parser、Profile、资源上限和固定 seed fuzz/property tests。
3. Product 在草稿 create/update、publish 三个入口原生调用同一 core。
4. `article-html-wasm` 导出同一 inspection schema，B Desktop 通过 `draftEditor.inspectHtml` 使用它。
5. B Desktop 只在 inspection 无 error 时将正文交给预览 `ArticleBody`。
6. 删除当前测试文章并通过合法 fixture 重建；随后完成 C Desktop、C Mobile 和 B Desktop 真实路径验收。

任何层都不得用正则、字符串黑名单或浏览器 `DOMParser` 代替 core，也不得在返回前静默补写链接的 `target`/`rel`。

