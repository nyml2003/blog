use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn inspect_html(source: &str) -> String {
    serde_json::to_string(&article_html_core::inspect(source))
        .expect("inspection contains only serializable scalar values")
}
