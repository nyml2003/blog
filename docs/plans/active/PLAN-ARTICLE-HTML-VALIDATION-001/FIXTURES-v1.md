# `article-html/v1` fixture matrix

这些 fixture 是共享 Rust core、WASM 预检和未来 HTTP 契约共用的最小矩阵。每个失败样例都应断言稳定 `code`、非空 source span 和 `profileVersion = article-html/v1`。

| 类别 | 输入/条件 | 期望 |
| --- | --- | --- |
| 合法结构 | `h2`、`p`、`ul/li`、`pre/code`、`blockquote`、`table` 的 Spec 矩阵嵌套 | 通过 |
| 合法链接 | `a href="https://…" target="_blank" rel="noopener noreferrer"` | 通过 |
| 空正文 | 空 fragment | 通过，按业务层决定是否允许保存 |
| 文本实体 | `amp/lt/gt/quot/apos`、十进制和小写 `x` 十六进制数字实体 | 通过并保留 source span |
| 未闭合/错嵌套 | `<p><strong>x</p>`、缺失结束标签 | `HTML_UNEXPECTED_EOF` 或 `HTML_MISMATCHED_TAG` |
| 语法 | 未引用属性、重复属性、大写名称、未知实体 | 对应 parser 诊断 |
| 元素 | `script`、`img`、`iframe`、`form`、自定义元素 | `HTML_UNSUPPORTED_ELEMENT` 或 `HTML_IMAGE_FORBIDDEN` |
| 属性 | `class`、`style`、`onclick`、`data-x`、未知属性 | `HTML_CLASS_FORBIDDEN`、`HTML_STYLE_FORBIDDEN`、`HTML_EVENT_ATTRIBUTE_FORBIDDEN` 或 `HTML_UNSUPPORTED_ATTRIBUTE` |
| 链接 | `javascript:`、`data:`、缺少 target、缺少/错误 rel | `HTML_LINK_SCHEME_FORBIDDEN`、`HTML_LINK_TARGET_REQUIRED`、`HTML_LINK_REL_REQUIRED` |
| 表格 | `colspan="0"`、非数字或超限 span | `HTML_INVALID_TABLE_SPAN` |
| 嵌套 | 根级 `li`、`ul > p`、嵌套 `a`、表格子级顺序或父级错误 | `HTML_UNSUPPORTED_NESTING` |
| 资源限制 | 超过 256 KiB、64 层、20000 节点、8 属性、4096 字节属性值或 65536 字节文本节点 | `HTML_RESOURCE_LIMIT` |

失败不得产生可供公开渲染的部分 AST，也不得对输入做自动修复或序列化。fixture runner 还必须生成固定 seed 的任意 UTF-8 输入，验证无 panic、无超时，并用节点数递增样本验证耗时不呈平方增长。
