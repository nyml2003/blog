use article_html_core::{MAX_INPUT_BYTES, inspect, parse};

#[test]
fn shared_fixtures() {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/article-html-v1.json")).unwrap();
    for case in fixtures["cases"].as_array().unwrap() {
        let result = inspect(case["source"].as_str().unwrap());
        assert_eq!(
            result.valid,
            case["valid"].as_bool().unwrap(),
            "{}: {:?}",
            case["id"],
            result
        );
        if !result.valid {
            assert!(
                case["codes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|code| code == &result.diagnostics[0].code),
                "{}: {:?}",
                case["id"],
                result
            );
        }
    }
}

#[test]
fn limits_and_unicode() {
    assert_eq!(
        inspect(&"x".repeat(MAX_INPUT_BYTES + 1)).diagnostics[0].code,
        "HTML_RESOURCE_LIMIT"
    );
    assert!(parse("<p>🙂&amp;中文</p>").is_ok());
    assert!(parse("<p>中</中>").is_err());
    assert!(parse("<中>").is_err());
}
