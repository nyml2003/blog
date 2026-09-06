---
kind: workstream
id: WORKSTREAM-ARTICLE-HTML-VALIDATION-PARSER
status: completed
plan_id: PLAN-ARTICLE-HTML-VALIDATION-001
role: backend-rust
owner: backend
depends_on: [WORKSTREAM-ARTICLE-HTML-VALIDATION-PRODUCT, WORKSTREAM-OPS-RUNTIME-BACKEND]
write_set: [Cargo.toml, crates/article-html-core/, crates/article-html-wasm/]
last_reviewed: 2026-09-06
---

# 共享 Rust HTML Fragment Parser、Profile Validator 与诊断 Schema

## 目标

实现一个小而严格、可审计的共享 Rust HTML Fragment Parser 与 Profile validator，作为正文校验的唯一语法入口。它解析受控 fragment 语言而不是复刻浏览器 HTML 容错解析，并输出不会改写作者原文的 AST、Profile 结果和位置诊断；同一 core 同时编译为 WASM 与后端原生库/适配器。

## 输入

- `SPEC-ARTICLE-HTML-VALIDATION-001.md` 中确认的 fragment 语法、显式闭合规则和作者示例；
- `PLAN.md` 的 Parser 范围与资源上限；
- Rust 工具链、WASM 目标和未来 Rust 后端领域模型。

## 输出

- Rust workspace 下独立的 tokenizer、AST、parser、位置与稳定错误模型；
- parser-only fixture 与单元测试；
- Parser API 契约、复杂度上限和不支持语法说明；
- 领域 Profile validator、稳定 diagnostic code、source span 和 schema version；WASM 与未来 Rust 后端使用同一结果模型。

## 实施任务

1. 先定义最小 AST、source span、diagnostic code 和 parser 资源限制，再实现状态机。
2. 手写逐字符 tokenizer，区分文本、开始标签、结束标签、属性和实体；v1 不接受空元素或自闭合结束，不通过正则提取标签或属性。
3. 使用元素栈构建树，严格处理嵌套和显式闭合。
4. 对属性引号、重复属性、名称字符、实体、控制字符、深度、节点数和总长度给出可定位错误。
5. 保持 AST 指向或标记输入 source span；不得实现自动闭合、格式化、serializer 或“修复后继续”。
6. 为空 fragment、Unicode 文本、复杂合法嵌套与每类非法 token 写 fixture；补充 fuzz/property 测试，断言任意输入只得到 AST 或受控诊断，绝不 panic、超时或指数级消耗。

## 测试/验收

- 合法 fragment 生成预期 AST 与精确 source span；
- 任一非法输入不会产生部分可供公开渲染的 AST；
- 长度、深度、节点和属性上限均有稳定错误；
- fuzz 测试在约定资源下稳定完成，无 panic、无限循环或不可控内存增长；
- 不依赖第三方 HTML parser/sanitizer，Rust 标准库使用范围被记录且不替代 tokenization/AST 逻辑。

## 阻塞

- 原 runtime workspace 写集阻塞已于 2026-09-06 用户确认后解除；
- Profile 试图引入需要浏览器 raw-text/错误恢复的元素时，必须退回产品决策，不得扩展 parser 猜测行为。

## 交付记录

- 2026-09-06：Profile 语法、资源上限、诊断 code、嵌套矩阵和机器可读 fixture 已就绪；crate 归属及与 Rust 后端的接入顺序见 `INTEGRATION-CONTRACT.md`。
- 2026-09-06：曾在当时存在的临时 spike workspace 中完成 `article-html-core` 原型并通过 7 组测试；随后并发的 runtime backend workstream 按已确认决策清理了整个 spike workspace。原型未恢复，以避免覆盖其 write set；正式实现必须在新 workspace 边界下重建并重新验收。
- 2026-09-06：已在正式 workspace 重建并验收：平坦 arena AST、栈式解析、Profile、UTF-8 span 和 fail-fast 资源限制；9 组 native 测试、6144 组固定 seed Unicode 输入及 287 组 native/WASM 完整结果比对通过。此条替代上条的待重建状态；详细证据见 `RESULT.md`。
