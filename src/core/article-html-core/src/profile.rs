use crate::{Diagnostic, Document, Element, NodeKind, Span};

const BLOCK: &[&str] = &["h2", "h3", "p", "ul", "ol", "pre", "blockquote", "table"];
const INLINE: &[&str] = &["a", "code"];
const STRUCTURE: &[&str] = &["li", "thead", "tbody", "tr", "th", "td"];

pub fn validate(document: &Document) -> Option<Diagnostic> {
    // Flat arena with parent indices: every node and attribute is visited once.
    for node in &document.nodes {
        let NodeKind::Element(element) = &node.kind else {
            continue;
        };
        let name = element.name.as_str();
        let fail = |code, message| Some(Diagnostic::error(code, message, node.span));
        if name == "img" {
            return fail("HTML_IMAGE_FORBIDDEN", "正文暂不支持图片");
        }
        if !BLOCK.contains(&name) && !INLINE.contains(&name) && !STRUCTURE.contains(&name) {
            return fail("HTML_UNSUPPORTED_ELEMENT", "正文不支持此元素");
        }
        for attribute in &element.attributes {
            let code = match attribute.name.as_str() {
                "class" => Some("HTML_CLASS_FORBIDDEN"),
                "style" => Some("HTML_STYLE_FORBIDDEN"),
                attr if attr.starts_with("on") => Some("HTML_EVENT_ATTRIBUTE_FORBIDDEN"),
                "href" | "target" | "rel" if name == "a" => None,
                "colspan" | "rowspan" if matches!(name, "td" | "th") => {
                    let valid = !attribute.value.is_empty()
                        && attribute.value.bytes().all(|b| b.is_ascii_digit())
                        && attribute
                            .value
                            .parse::<u16>()
                            .is_ok_and(|n| (1..=100).contains(&n));
                    if valid {
                        None
                    } else {
                        Some("HTML_INVALID_TABLE_SPAN")
                    }
                }
                _ => Some("HTML_UNSUPPORTED_ATTRIBUTE"),
            };
            if let Some(code) = code {
                let message = match code {
                    "HTML_CLASS_FORBIDDEN" => "正文禁止 class 属性，样式由系统主题提供",
                    "HTML_STYLE_FORBIDDEN" => "正文禁止 style 属性，样式由系统主题提供",
                    "HTML_EVENT_ATTRIBUTE_FORBIDDEN" => "正文禁止事件处理属性",
                    "HTML_INVALID_TABLE_SPAN" => "表格跨度必须为 1 到 100 的十进制整数",
                    _ => "此元素不支持该属性，请移除",
                };
                return Some(Diagnostic::error(code, message, attribute.span));
            }
        }
        if name == "a"
            && let Some(diagnostic) = link(element, node.span)
        {
            return Some(diagnostic);
        }
        let parent = node
            .parent
            .and_then(|index| match &document.nodes[index].kind {
                NodeKind::Element(parent) => Some(parent.name.as_str()),
                _ => None,
            });
        if !allowed_child(parent, name) {
            return fail("HTML_UNSUPPORTED_NESTING", "元素不允许出现在此父级中");
        }
        if let Some(diagnostic) = children(document, element, node.span) {
            return Some(diagnostic);
        }
    }
    None
}

fn allowed_child(parent: Option<&str>, child: &str) -> bool {
    match parent {
        None => BLOCK.contains(&child),
        Some("p" | "h2" | "h3") => INLINE.contains(&child),
        Some("a" | "pre") => child == "code",
        Some("code") => false,
        Some("ul" | "ol") => child == "li",
        Some("table") => matches!(child, "thead" | "tbody" | "tr"),
        Some("thead" | "tbody") => child == "tr",
        Some("tr") => matches!(child, "th" | "td"),
        Some("li" | "blockquote" | "th" | "td") => {
            BLOCK.contains(&child) || INLINE.contains(&child)
        }
        _ => false,
    }
}

fn children(document: &Document, element: &Element, span: Span) -> Option<Diagnostic> {
    let name = element.name.as_str();
    let mut elements = Vec::new();
    let mut has_text = false;
    for index in &element.children {
        match &document.nodes[*index].kind {
            NodeKind::Text(text) => {
                if !text
                    .chars()
                    .all(|ch| matches!(ch, ' ' | '\t' | '\r' | '\n'))
                {
                    has_text = true;
                }
            }
            NodeKind::Element(child) => elements.push(child.name.as_str()),
        }
    }
    let structural = matches!(name, "table" | "thead" | "tbody" | "tr" | "ul" | "ol");
    let bad_text = has_text && (structural || name == "pre" && !elements.is_empty());
    let bad_empty = matches!(name, "thead" | "tbody" | "tr") && elements.is_empty();
    let bad_table = name == "table" && !valid_table(&elements);
    if bad_text || bad_empty || bad_table {
        return Some(Diagnostic::error(
            "HTML_UNSUPPORTED_NESTING",
            "结构元素的子级或文本不符合正文规则",
            span,
        ));
    }
    None
}
fn valid_table(elements: &[&str]) -> bool {
    if elements.is_empty() {
        return true;
    }
    if elements.iter().all(|name| *name == "tr") {
        return true;
    }
    matches!(elements, ["thead"] | ["tbody"] | ["thead", "tbody"])
}

fn link(element: &Element, span: Span) -> Option<Diagnostic> {
    for (name, code, message) in [
        (
            "href",
            "HTML_LINK_SCHEME_FORBIDDEN",
            "链接必须有合法的绝对 http/https URL",
        ),
        (
            "target",
            "HTML_LINK_TARGET_REQUIRED",
            "链接必须显式写出 target=\"_blank\"",
        ),
        (
            "rel",
            "HTML_LINK_REL_REQUIRED",
            "链接必须显式写出 rel=\"noopener noreferrer\"",
        ),
    ] {
        let attribute = element
            .attributes
            .iter()
            .find(|attribute| attribute.name == name);
        let valid = attribute.is_some_and(|attribute| match name {
            "href" => valid_url(&attribute.value),
            "target" => attribute.value == "_blank",
            "rel" => {
                let tokens: Vec<_> = attribute.value.split_ascii_whitespace().collect();
                matches!(
                    tokens.as_slice(),
                    ["noopener", "noreferrer"] | ["noreferrer", "noopener"]
                )
            }
            _ => false,
        });
        if !valid {
            return Some(Diagnostic::error(
                code,
                message,
                attribute.map_or(span, |a| a.value_span),
            ));
        }
    }
    None
}

fn valid_url(url: &str) -> bool {
    if url
        .chars()
        .any(|ch| ch.is_control() || ch.is_whitespace() || ch == '\\')
    {
        return false;
    }
    let Some(rest) = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
    else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let (host, port) = match authority.split_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (authority, None),
    };
    if host.is_empty() || host.len() > 253 {
        return false;
    }
    if port.is_some_and(|port| {
        port.is_empty()
            || !port.bytes().all(|b| b.is_ascii_digit())
            || !port.parse::<u16>().is_ok_and(|n| n > 0)
    }) {
        return false;
    }
    // Reject numeric host shortcuts and legacy octal/hex interpretation by browsers.
    if host.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
        return host.parse::<std::net::Ipv4Addr>().is_ok();
    }
    let host = host.strip_suffix('.').unwrap_or(host);
    if host.split('.').any(|label| {
        label.is_empty()
            || label.len() > 63
            || label.starts_with('-')
            || label.ends_with('-')
            || !label
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    }) {
        return false;
    }
    let last = host.rsplit('.').next().unwrap_or_default();
    if last.bytes().all(|b| b.is_ascii_digit()) || last.to_ascii_lowercase().starts_with("0x") {
        return false;
    }
    true
}
