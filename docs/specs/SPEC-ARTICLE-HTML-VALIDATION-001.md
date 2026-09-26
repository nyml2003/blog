---
kind: spec
id: SPEC-ARTICLE-HTML-VALIDATION-001
status: confirmed
version: 1
owner: product-content-design
last_reviewed: 2026-09-06
---

# 文章 HTML Profile 与校验契约

## 目的与边界

文章正文是由系统主题包裹的严格 HTML fragment，不是完整 HTML 文档，也不是 Markdown 或富文本编辑器内容。通过校验的原文按现有模型保存；校验器只报告结果，不静默删除、重排、转义或重新序列化正文。校验失败时不得改变上次成功保存的内容。

Profile `article-html/v1` 由共享 Rust HTML Fragment Parser 和 Profile validator 实现。浏览器容错、第三方 sanitizer、正则表达式或字符串黑名单都不是安全边界。无法明确理解的语法直接拒绝，并返回 source span。

## 已确认的内容策略

| 决策 | v1 规则 |
| --- | --- |
| 草稿与发布 | 无效正文不能保存为草稿；保存和提交都必须通过校验，发布和同步同样必须阻断非法正文。预览不得把未通过校验的正文直接注入可信阅读路径。 |
| 图片 | 不支持 `img`，不允许图片 URL 或图片属性。 |
| 链接 | 允许 `http` 与 `https`；每个正文链接必须输出 `target="_blank"` 和 `rel="noopener noreferrer"`。作者未写出这两个属性时校验失败，不由系统静默补写。 |
| class | 正文完全禁止 `class` 属性。系统主题 class 不属于作者内容协议。 |
| 历史正文 | 当前数据库内容均为测试数据。Profile 上线前删除测试正文，按 v1 合法 fixture 重建；不做自动迁移或自动修复。 |

## 允许集合

第一期只允许已有 Desktop/Mobile `.article-body` 主题实际消费的语义元素：

`p`、`h2`、`h3`、`ul`、`ol`、`li`、`pre`、`code`、`blockquote`、`table`、`thead`、`tbody`、`tr`、`th`、`td`、`a`。

允许的属性只有：

- `a`: `href`、`target`、`rel`；`href` 必须是绝对、小写 scheme 的 `http://` 或 `https://` URL。authority 只接受 ASCII 域名/IPv4 字面量和可选十进制端口；禁止用户名密码、空 authority、反斜线、控制字符、空白、IPv6 字面量和解析后改变 scheme/authority 的编码。`target` 必须为 `_blank`；`rel` 必须由且仅由 `noopener`、`noreferrer` 两个不重复的 ASCII 空白分隔 token 组成，token 顺序不限。
- `th`、`td`: 可选 `colspan`、`rowspan`，值为 `1..=100` 的无符号十进制整数。

不允许任意 `style`、`class`、事件属性、`id`、`data-*`、`aria-*`、表单属性、内联脚本或其他未列出的属性。v1 不包含图片、音视频、iframe、embed、object、表单、SVG、MathML、脚本、模板和自定义元素。

## Fragment 语法

- 输入必须是 fragment；拒绝 `doctype`、注释、处理指令、CDATA、raw-text 元素和完整文档外壳。
- 标签和属性名称必须小写；开始/结束标签必须成对且严格嵌套；属性值必须带引号；禁止重复属性。
- v1 不定义 void 元素，因此所有元素都必须显式闭合。
- 命名实体只接受 `&amp;`、`&lt;`、`&gt;`、`&quot;`、`&apos;`。数字实体接受十进制 `&#...;` 和小写 `x` 的十六进制 `&#x...;`；结果必须是有效 Unicode scalar value，且不能是 NUL 或除换行、回车、Tab 以外的控制字符。实体 token（`&` 与 `;` 之间）最多 16 个 ASCII 字节，超长、未知、空、截断或畸形实体拒绝。不对解码结果再次解码。
- source span 使用 UTF-8 字节半开区间 `[startByte, endByte)`；line/column 均从 1 开始，column 按 Unicode scalar value 计数。正文大小、嵌套深度、节点数、属性数、属性值长度和文本长度超过上限时返回资源限制诊断。
- 空 fragment 作为空正文合法；空元素节点、只含空白的结构是否允许由元素内容规则判定，不进行隐式补全。

## 元素嵌套

| 父级 | 允许的直接元素子级 | 文本规则 |
| --- | --- | --- |
| fragment root | `h2`、`h3`、`p`、`ul`、`ol`、`pre`、`blockquote`、`table` | 允许普通文本 |
| `p`、`h2`、`h3` | `a`、`code` | 允许 |
| `a` | `code` | 允许；任意深度都禁止再次嵌套 `a` |
| `code` | 无 | 允许 |
| `pre` | `code` | 允许；若含 `code`，其他直接文本只能为空白 |
| `ul`、`ol` | `li` | 只允许空白文本 |
| `li`、`blockquote`、`th`、`td` | `p`、`h2`、`h3`、`ul`、`ol`、`pre`、`blockquote`、`table`、`a`、`code` | 允许 |
| `table` | 可选 `thead`，随后可选 `tbody`；或直接一个以上 `tr` | 只允许空白文本；`thead`/`tbody` 与直接 `tr` 不混用 |
| `thead`、`tbody` | 一个以上 `tr` | 只允许空白文本 |
| `tr` | 一个以上 `th` 或 `td` | 只允许空白文本 |

`li` 只能属于 `ul`/`ol`，`thead`/`tbody` 只能属于 `table`，`tr` 只能属于 `table`/`thead`/`tbody`，`th`/`td` 只能属于 `tr`。除此之外的结构即使浏览器能够自动修复也必须拒绝。

## 资源与复杂度上限

| 资源 | v1 上限 |
| --- | ---: |
| UTF-8 输入长度 | 262144 字节（256 KiB） |
| 元素嵌套深度 | 64 |
| 元素与文本节点总数 | 20000 |
| 单个元素属性数 | 8 |
| 单个属性值 | 4096 字节 |
| 单个文本节点 | 65536 字节 |

Parser 和 validator 对输入长度及 AST 节点数必须保持线性时间，不得为每个节点重新扫描全文或完整节点表。资源上限在分配或继续扫描前检查；失败不返回可供渲染的部分 AST。

## 诊断契约

每个诊断至少包含：

```text
{
  code: stable diagnostic code,
  severity: "error" | "warning",
  message: author-readable message,
  span: {
    start: { byte, line, column },
    end: { byte, line, column }
  },
  profileVersion: "article-html/v1"
}
```

v1 诊断 code：`HTML_UNEXPECTED_EOF`、`HTML_INVALID_NAME`、`HTML_UNQUOTED_ATTRIBUTE`、`HTML_DUPLICATE_ATTRIBUTE`、`HTML_INVALID_ATTRIBUTE_VALUE`、`HTML_INVALID_TEXT`、`HTML_INVALID_ENTITY`、`HTML_MISMATCHED_TAG`、`HTML_SELF_CLOSING_FORBIDDEN`、`HTML_UNSUPPORTED_SYNTAX`、`HTML_UNSUPPORTED_ELEMENT`、`HTML_UNSUPPORTED_ATTRIBUTE`、`HTML_UNSUPPORTED_NESTING`、`HTML_CLASS_FORBIDDEN`、`HTML_STYLE_FORBIDDEN`、`HTML_EVENT_ATTRIBUTE_FORBIDDEN`、`HTML_IMAGE_FORBIDDEN`、`HTML_LINK_SCHEME_FORBIDDEN`、`HTML_LINK_TARGET_REQUIRED`、`HTML_LINK_REL_REQUIRED`、`HTML_INVALID_TABLE_SPAN`、`HTML_RESOURCE_LIMIT`。

诊断属于领域结果，不泄漏 parser 内部节点、SQL、HTTP 或 Rust 错误类型。WASM 与 Rust Product 使用同一个 core，返回同一 schema 和 code；WASM 仅改善编辑体验，不能替代服务端发布边界。v1 采用 fail-fast：先报告第一个语法错误；语法完整后报告第一个 Profile 错误，不返回部分可渲染 AST。资源错误的 span 指向超限位置；输入总长度超限在扫描前拒绝，span 为原点空区间。换行以 LF 计行，CR 作为一个 scalar 计列。

管理端详情和成功的创建/更新/发布/取消发布响应保留现有 Article 字段，追加 `htmlInspection: { profileVersion, valid, diagnostics }`。违反发布门槛时返回 HTTP 422、`code: INVALID_ARTICLE_HTML`，`data.htmlInspection` 携带同一诊断结果；不能信任请求提供的诊断或 Profile version。

## 状态与安全要求

- 创建和更新：无效正文拒绝保存，必须把诊断返回给 B Desktop；编辑器保留标题、摘要、分类、标签和原始 HTML 输入，以及上次成功保存的状态。
- 已发布文章更新：有效正文可更新；无效正文拒绝，保留当前已发布版本，不自动取消发布。草稿保存、批次提交和同步使用原子状态/原文比较，竞态返回冲突并要求重新读取，不能跳过重新校验。
- 发布：正文必须通过 `article-html/v1`，否则拒绝状态转换。
- 预览：通过 Profile 前不得把原始 `innerHTML` 注入可信 `ArticleBody`。B Desktop 应显示诊断或使用受控的失败状态；通过校验后才允许阅读预览。
- C Desktop、C Mobile 和发布后的 B 预览只渲染服务端已通过 Profile 的正文。公开读取不依赖浏览器端再次消毒。

## 合法示例

```html
<h2>问题定位</h2>
<p>先记录可复现的输入。</p>
<pre><code>cargo test</code></pre>
<blockquote><p>保留关键证据。</p></blockquote>
<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">参考资料</a></p>
```

## 必拒示例

```html
<script>alert(1)</script>
<p onclick="run()">事件属性</p>
<p style="color:red">内联样式</p>
<p class="custom">作者 class</p>
<img src="https://example.com/a.png">
<a href="javascript:alert(1)">危险 URL</a>
<a href="https://example.com">缺少强制安全属性</a>
```

## 兼容性与变更

任何允许元素、属性、URL scheme、实体、资源上限或诊断语义变化都必须提升 Profile version，并同步更新 fixture、WASM/backend schema 和兼容性说明。v1 不承诺浏览器自动修复后的 DOM 与正文语义等价。
