# @fluvient-loom/text-highlight

文章正文和其他文档容器共用的文本匹配与浏览器高亮能力。当前作为 workspace 私有包维护。

- `@fluvient-loom/text-highlight`：无 DOM 的连续文本匹配。
- `@fluvient-loom/text-highlight/web`：把命中区间映射到 Text 节点，优先使用 CSS Custom Highlight API，旧浏览器回退到临时 `<mark>`。
- `styles.css`：CSS Custom Highlight 的最小视觉样式。
