use article_html_core::{
    MAX_ATTRIBUTE_BYTES, MAX_DEPTH, MAX_INPUT_BYTES, MAX_NODES, MAX_TEXT_BYTES, NodeKind, inspect,
    parse,
};

fn rejects(source: &str, code: &str) {
    let result = inspect(source);
    assert!(!result.valid, "accepted {source:?}");
    assert_eq!(result.diagnostics[0].code, code, "{source:?}");
}

#[test]
fn resource_limits_are_inclusive() {
    for size in [MAX_TEXT_BYTES - 1, MAX_TEXT_BYTES] {
        assert!(parse(&"x".repeat(size)).is_ok());
    }
    rejects(&"x".repeat(MAX_TEXT_BYTES + 1), "HTML_RESOURCE_LIMIT");
    let at_limit = format!("<p>{}</p>", "x".repeat(MAX_INPUT_BYTES / 4 - 7)).repeat(4);
    assert_eq!(at_limit.len(), MAX_INPUT_BYTES);
    assert!(inspect(&at_limit).valid);
    rejects(&(at_limit + "x"), "HTML_RESOURCE_LIMIT");
    for depth in [MAX_DEPTH - 1, MAX_DEPTH] {
        assert!(
            inspect(&format!(
                "{}{}",
                "<blockquote>".repeat(depth),
                "</blockquote>".repeat(depth)
            ))
            .valid
        );
    }
    rejects(&"<blockquote>".repeat(MAX_DEPTH + 1), "HTML_RESOURCE_LIMIT");
    assert!(parse(&"<p></p>".repeat(MAX_NODES)).is_ok());
    rejects(&"<p></p>".repeat(MAX_NODES + 1), "HTML_RESOURCE_LIMIT");
    assert!(parse("<p a='1' b='2' c='3' d='4' e='5' f='6' g='7' h='8'></p>").is_ok());
    rejects(
        "<p a='1' b='2' c='3' d='4' e='5' f='6' g='7' h='8' i='9'></p>",
        "HTML_RESOURCE_LIMIT",
    );
    assert!(parse(&format!("<p x='{}'></p>", "x".repeat(MAX_ATTRIBUTE_BYTES))).is_ok());
    rejects(
        &format!("<p x='{}'></p>", "x".repeat(MAX_ATTRIBUTE_BYTES + 1)),
        "HTML_RESOURCE_LIMIT",
    );
}

#[test]
fn spans_use_utf8_bytes_and_scalar_columns() {
    let source = "<p>中🙂\n&amp;&bad;</p>";
    let diagnostic = &inspect(source).diagnostics[0];
    assert_eq!(diagnostic.code, "HTML_INVALID_ENTITY");
    assert_eq!(diagnostic.span.start.byte, 16);
    assert_eq!(
        (diagnostic.span.start.line, diagnostic.span.start.column),
        (2, 6)
    );
    assert_eq!(diagnostic.span.end.byte, 21);
    assert_eq!(
        (diagnostic.span.end.line, diagnostic.span.end.column),
        (2, 11)
    );
    assert_eq!(
        &source[diagnostic.span.start.byte..diagnostic.span.end.byte],
        "&bad;"
    );
    let document = parse("<p>中&amp;</p>").unwrap();
    assert_eq!(document.nodes[0].span.end.byte, 15);
    let NodeKind::Text(text) = &document.nodes[1].kind else {
        panic!("text expected")
    };
    assert_eq!(text, "中&");
}

#[test]
fn malformed_and_ambiguous_entities_fail_closed() {
    for entity in [
        "&",
        "&amp",
        "&nbsp;",
        "&#;",
        "&#x;",
        "&#X41;",
        "&#-1;",
        "&#+65;",
        "&#0;",
        "&#xD800;",
        "&#1114112;",
        "&#128;",
        "&#x1f;",
        "&#9999999999999999999999;",
    ] {
        rejects(&format!("<p>{entity}</p>"), "HTML_INVALID_ENTITY");
    }
    assert!(inspect("<p>&amp;&lt;&gt;&quot;&apos;&#65;&#x1F642;&#10;&#13;&#9;</p>").valid);
    assert!(inspect("<p>&amp;amp</p>").valid);
    assert!(inspect(&format!("<p>&#{}65;</p>", "0".repeat(13))).valid);
    rejects(
        &format!("<p>&#{}65;</p>", "0".repeat(14)),
        "HTML_INVALID_ENTITY",
    );
}

#[test]
fn browser_repair_structures_are_not_accepted() {
    for source in [
        "<p><p>x</p></p>",
        "<h2><h3>x</h3></h2>",
        "<ul>x<li>y</li></ul>",
        "<table>x<tr><td>y</td></tr></table>",
        "<table><tbody></tbody></table>",
        "<table><tbody><tr><td>x</td></tr></tbody><tr><td>y</td></tr></table>",
        "<table><tbody><tr><td>x</td></tr></tbody><thead><tr><th>y</th></tr></thead></table>",
        "<pre>text<code>x</code></pre>",
        "<code><p>x</p></code>",
        "<li>x</li>",
        "<p><table></table></p>",
        "<p><a href='https://example.com' target='_blank' rel='noopener noreferrer'><code><a href='https://example.com' target='_blank' rel='noopener noreferrer'>x</a></code></a></p>",
    ] {
        rejects(source, "HTML_UNSUPPORTED_NESTING");
    }
}

#[test]
fn executable_and_author_styling_capabilities_are_rejected() {
    for element in [
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "svg",
        "math",
        "template",
        "form",
        "input",
        "video",
        "audio",
        "link",
        "meta",
        "html",
        "body",
        "custom-element",
    ] {
        rejects(
            &format!("<{element}></{element}>"),
            "HTML_UNSUPPORTED_ELEMENT",
        );
    }
    for (attribute, code) in [
        ("class", "HTML_CLASS_FORBIDDEN"),
        ("style", "HTML_STYLE_FORBIDDEN"),
        ("onerror", "HTML_EVENT_ATTRIBUTE_FORBIDDEN"),
        ("id", "HTML_UNSUPPORTED_ATTRIBUTE"),
        ("data-theme", "HTML_UNSUPPORTED_ATTRIBUTE"),
        ("src", "HTML_UNSUPPORTED_ATTRIBUTE"),
    ] {
        rejects(&format!("<p {attribute}='x'>text</p>"), code);
    }
    assert!(!inspect("<img src='https://example.com/x' onerror='alert(1)'>").valid);
}

#[test]
fn url_grammar_blocks_scheme_and_authority_ambiguities() {
    for href in [
        "javascript:alert(1)",
        "data:text/html,x",
        "//example.com",
        "/path",
        "HTTPS://example.com",
        "https://",
        "https://user@example.com",
        "https://example.com\\evil",
        "https://example.com:0",
        "https://example.com:65536",
        "https://example.com:abc",
        "https://example.com:",
        "https://example.com:80:80",
        "https://example.com&#10;/x",
        "https://%65xample.com",
        "https://example.com%2f.evil",
        "https://[::1]",
        "https://127.1",
        "https://0177.0.0.1",
        "https://0x7f000001",
        "https://example.123",
        "https://-example.com",
        "https://example..com",
        "https://例子.com",
        "https://example.com/ space",
    ] {
        rejects(
            &format!("<p><a href='{href}' target='_blank' rel='noopener noreferrer'>x</a></p>"),
            "HTML_LINK_SCHEME_FORBIDDEN",
        );
    }
    for href in [
        "http://example.com",
        "https://127.0.0.1:8080/path",
        "https://example.com./a?b=1&amp;c=2#x",
        "https://example.com/中文",
    ] {
        assert!(
            inspect(&format!(
                "<p><a href='{href}' target='_blank' rel='noopener noreferrer'>x</a></p>"
            ))
            .valid,
            "{href}"
        );
    }
    for attributes in [
        "href='https://example.com'",
        "href='https://example.com' target='_blank'",
        "href='https://example.com' target='_self' rel='noopener noreferrer'",
        "href='https://example.com' target='_blank' rel='noopener noreferrer noopener'",
    ] {
        assert!(!inspect(&format!("<p><a {attributes}>x</a></p>")).valid);
    }
}

#[test]
fn arbitrary_unicode_never_panics_and_diagnostics_are_locatable() {
    let alphabet = [
        '<', '>', '/', '=', '\'', '"', '&', ';', '#', 'p', '中', '🙂', '\0', '\n', '\r', ' ', 'x',
        '1',
    ];
    let mut state = 0x157f_317du64;
    for length in 0..256 {
        for _ in 0..24 {
            let source: String = (0..length)
                .map(|_| {
                    state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
                    alphabet[(state >> 32) as usize % alphabet.len()]
                })
                .collect();
            let result = inspect(&source);
            for diagnostic in result.diagnostics {
                assert!(diagnostic.span.start.byte <= diagnostic.span.end.byte);
                assert!(diagnostic.span.end.byte <= source.len());
                assert!(source.is_char_boundary(diagnostic.span.start.byte));
                assert!(source.is_char_boundary(diagnostic.span.end.byte));
            }
        }
    }
}
