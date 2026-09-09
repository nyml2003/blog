//! 页面路由清单（SPEC-SITE-ROUTES-001）。
//!
//! 前端导航不持有 URL 字面量：`GET /api/public/site-routes` 把页面 id → 路径的
//! 清单下发给前端，Product 与 Mock 引用同一份编译期内嵌清单，两侧保证一致。
//! 清单源文件 `src/frontend/site-routes.json` 与 `pages.registry.ts` 的同步由
//! 前端 `page-template.test.ts` 守卫；本模块在进程内解析一次并缓存。

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// 编译期内嵌的清单源文件（与 `pages.registry.ts` 同步，见模块文档）。
pub const SITE_ROUTES_MANIFEST: &str = include_str!("../../../frontend/site-routes.json");

const MANIFEST_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
struct ManifestFile {
    version: u32,
    routes: BTreeMap<String, String>,
}

/// `/api/public/site-routes` 的 `data` 载荷：`{ "routes": { "<page id>": "<path>" } }`。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteRoutesPayload {
    pub routes: BTreeMap<String, String>,
}

fn parse_manifest(source: &str) -> Result<SiteRoutesPayload, String> {
    let file: ManifestFile =
        serde_json::from_str(source).map_err(|error| format!("parse site-routes.json: {error}"))?;
    if file.version != MANIFEST_VERSION {
        return Err(format!(
            "unsupported site-routes.json version: {}",
            file.version
        ));
    }
    if file.routes.is_empty() {
        return Err("site-routes.json contains no routes".to_string());
    }
    for (key, path) in &file.routes {
        let valid_key = !key.is_empty()
            && key
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        let valid_path = path.starts_with('/') && !path.contains('?') && !path.contains('#');
        if !valid_key || !valid_path {
            return Err(format!("invalid site route: {key} -> {path}"));
        }
    }
    Ok(SiteRoutesPayload {
        routes: file.routes,
    })
}

/// 解析内嵌清单；进程内只解析一次，错误同样被缓存（配置错误应在首次请求暴露）。
pub fn site_routes_payload() -> Result<SiteRoutesPayload, String> {
    static PARSED: OnceLock<Result<SiteRoutesPayload, String>> = OnceLock::new();
    PARSED
        .get_or_init(|| parse_manifest(SITE_ROUTES_MANIFEST))
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_manifest_parses_with_known_routes() {
        let payload = site_routes_payload().expect("embedded manifest must parse");
        assert_eq!(payload.routes.len(), 17);
        assert_eq!(payload.routes["desktop-public-home"], "/");
        assert_eq!(payload.routes["desktop-admin-home"], "/admin/index.html");
        assert_eq!(
            payload.routes["mobile-article-detail"],
            "/m/articles/detail.html"
        );
    }

    #[test]
    fn manifest_rejects_invalid_entries() {
        assert!(parse_manifest(r#"{"version":1,"routes":{}}"#).is_err());
        assert!(parse_manifest(r#"{"version":2,"routes":{"a":"/"}}"#).is_err());
        assert!(parse_manifest(r#"{"version":1,"routes":{"a":"no-slash"}}"#).is_err());
        assert!(parse_manifest(r#"{"version":1,"routes":{"Bad-Key":"/"}}"#).is_err());
        assert!(parse_manifest(r#"{"version":1,"routes":{"a":"/x?q=1"}}"#).is_err());
    }
}
