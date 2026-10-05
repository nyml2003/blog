//! `web/dist` 静态挂载。
//!
//! 路由契约与已移除的 Go 参考实现行为对齐（2026-09-06 退场，原 `frontendHandler`）：
//!
//! - 页面路径映射表（`/`、`/articles/index.html`、`/m`、`/admin/...`）精确匹配，
//!   命中即返回对应 `index.html`/`*.html`；
//! - `/assets/*` 按静态文件返回（内容类型按扩展名）；
//! - 其他路径 → `404 page not found`（text/plain）；
//! - 非 GET/HEAD → `405 method not allowed`；
//! - `/healthz` 在路由表中先于静态兜底命中，因此不会落到这里。
//!
//! 缓存契约（2026-09-30 引入）：`/assets/*` 文件名带内容哈希，返回
//! `Cache-Control: public, max-age=31536000, immutable`；页面 HTML 返回
//! `Cache-Control: no-cache`，保证发布后下一次导航即拿到新入口。
//!
//! 压缩契约（2026-10-05 引入）：构建期由 `@fluvient-loom/page-build-kit` 的
//! `compressArtifacts()` 为产物生成 `<file>.zst|.br|.gz` 预压缩兄弟文件；
//! 本服务按 `Accept-Encoding`（含 q 值与 q=0 排除）协商直接回发对应变体，
//! 零运行时压缩 CPU。所有静态响应（压缩与原始）都带 `Vary: Accept-Encoding`。
//! 客户端可接受的编码在磁盘上没有对应变体时回退原始产物。
//!
//! SPIKE-001（回退行为观察）见 `WORKSTREAM-OPS-RUNTIME-BACKEND.md` 交付记录。

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use axum::http::{Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;

const ASSETS_PREFIX: &str = "/assets/";
const PAGE_ROUTES_MANIFEST: &str = "page-routes.json";
const ASSETS_CACHE_CONTROL: &str = "public, max-age=31536000, immutable";
const PAGE_CACHE_CONTROL: &str = "no-cache";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageRoute {
    alias: String,
    output_path: String,
}

fn load_page_routes(root: &Path) -> Result<HashMap<String, String>, String> {
    let filename = root.join(PAGE_ROUTES_MANIFEST);
    let source = std::fs::read_to_string(&filename)
        .map_err(|error| format!("read {}: {error}", filename.display()))?;
    let routes: Vec<PageRoute> = serde_json::from_str(&source)
        .map_err(|error| format!("parse {}: {error}", filename.display()))?;
    if routes.is_empty() {
        return Err(format!("{} contains no page routes", filename.display()));
    }

    let mut pages = HashMap::with_capacity(routes.len());
    for route in routes {
        let valid_alias = route.alias.starts_with('/')
            && !route.alias.contains('?')
            && !route.alias.contains('#');
        if !valid_alias {
            return Err(format!("invalid page alias: {}", route.alias));
        }
        let output_path = Path::new(&route.output_path);
        let valid_output_path = !route.output_path.is_empty()
            && !output_path.is_absolute()
            && output_path
                .components()
                .all(|component| matches!(component, Component::Normal(_)));
        if !valid_output_path {
            return Err(format!("invalid page output path: {}", route.output_path));
        }
        if pages
            .insert(route.alias.clone(), route.output_path)
            .is_some()
        {
            return Err(format!("duplicate page alias: {}", route.alias));
        }
    }
    Ok(pages)
}

#[derive(Clone)]
pub struct StaticFiles {
    root: PathBuf,
    pages: HashMap<String, String>,
    route_manifest_error: Option<String>,
}

impl StaticFiles {
    /// `root` 为 ops 注入的 `BLOG_WEB_DIR`（仓库内 `web/dist` 绝对路径）。
    pub fn new(root: PathBuf) -> Self {
        let (pages, route_manifest_error) = match load_page_routes(&root) {
            Ok(pages) => (pages, None),
            Err(error) => (HashMap::new(), Some(error)),
        };
        Self {
            root,
            pages,
            route_manifest_error,
        }
    }

    pub fn root(&self) -> &std::path::Path {
        &self.root
    }

    /// 静态解析入口；未知路径、目录路径、深层刷新路径都到这里。
    /// `accept_encoding` 为请求的 `Accept-Encoding` 原始值（缺省 → 原始产物）。
    pub async fn serve(
        &self,
        method: &Method,
        path: &str,
        accept_encoding: Option<&str>,
    ) -> Response {
        if method != Method::GET && method != Method::HEAD {
            return plain(StatusCode::METHOD_NOT_ALLOWED, "method not allowed\n");
        }
        // 精确页面映射（含 `/m`、`/admin` 这类无尾斜杠目录路径）。
        if let Some(relative) = self.pages.get(path) {
            return self.read_file(relative, true, accept_encoding).await;
        }
        if path == "/mobile-prefetch-sw.js" {
            return self
                .read_file("mobile-prefetch-sw.js", false, accept_encoding)
                .await;
        }
        if let Some(asset) = path.strip_prefix(ASSETS_PREFIX) {
            if asset.is_empty() || asset.contains("..") || asset.contains('\\') {
                return plain(StatusCode::NOT_FOUND, "404 page not found\n");
            }
            return self
                .read_file(&format!("assets/{asset}"), false, accept_encoding)
                .await;
        }
        if let Some(error) = &self.route_manifest_error {
            crate::product_error!("page route manifest unavailable error={error}");
            return plain(StatusCode::INTERNAL_SERVER_ERROR, "internal server error\n");
        }
        plain(StatusCode::NOT_FOUND, "404 page not found\n")
    }

    async fn read_file(
        &self,
        relative: &str,
        is_page: bool,
        accept_encoding: Option<&str>,
    ) -> Response {
        // 按客户端接受度依次尝试预压缩变体；磁盘上没有就回退原始产物。
        for (encoding, suffix) in accepted_encodings(accept_encoding) {
            let variant = self.root.join(format!("{relative}{suffix}"));
            if let Ok(bytes) = tokio::fs::read(&variant).await {
                return encoded_response(relative, is_page, encoding, bytes);
            }
        }
        let path = self.root.join(relative);
        match tokio::fs::read(&path).await {
            Ok(bytes) => {
                let content_type = content_type_of(relative, is_page);
                let cache_control = if is_page {
                    PAGE_CACHE_CONTROL
                } else {
                    ASSETS_CACHE_CONTROL
                };
                (
                    StatusCode::OK,
                    [
                        (header::CONTENT_TYPE, content_type),
                        (header::CACHE_CONTROL, cache_control),
                        (header::VARY, "Accept-Encoding"),
                    ],
                    bytes,
                )
                    .into_response()
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                crate::product_info!(
                    "static file missing path={} root={}",
                    path.display(),
                    self.root.display()
                );
                plain(StatusCode::NOT_FOUND, "404 page not found\n")
            }
            Err(error) => {
                crate::product_error!(
                    "static file read failed path={} error={}",
                    path.display(),
                    error
                );
                plain(StatusCode::INTERNAL_SERVER_ERROR, "internal server error\n")
            }
        }
    }
}

/// 预压缩编码表：产物后缀与 `Content-Encoding` 值的唯一对照
/// （与构建期 `compressArtifacts()` 约定一致）。
const PRECOMPRESSED: [(&str, &str); 3] = [("zstd", ".zst"), ("br", ".br"), ("gzip", ".gz")];

/// Accept-Encoding 协商：返回客户端可接受（q>0）的编码，按
/// 「q 降序、服务器偏好（zstd > br > gzip）升序」排列。
/// 解析规则：逗号分段；`;q=` 只认数字（非法值按 1.0）；显式 token 优先于 `*`。
fn accepted_encodings(accept: Option<&str>) -> Vec<(&'static str, &'static str)> {
    let Some(accept) = accept else {
        return Vec::new();
    };
    let mut entries: Vec<(String, f32)> = Vec::new();
    for part in accept.split(',') {
        let mut fields = part.split(';');
        let token = fields.next().unwrap_or("").trim().to_ascii_lowercase();
        if token.is_empty() {
            continue;
        }
        let mut quality = 1.0f32;
        for field in fields {
            let field = field.trim();
            if let Some(value) = field
                .strip_prefix(['q', 'Q'])
                .and_then(|rest| rest.strip_prefix('='))
            {
                if let Ok(parsed) = value.trim().parse::<f32>() {
                    quality = parsed;
                }
            }
        }
        entries.push((token, quality));
    }
    let quality_of = |encoding: &str| -> Option<f32> {
        if let Some((_, quality)) = entries.iter().find(|(token, _)| token == encoding) {
            return Some(*quality);
        }
        entries
            .iter()
            .find(|(token, _)| token == "*")
            .map(|(_, q)| *q)
    };
    let mut accepted: Vec<(f32, usize)> = PRECOMPRESSED
        .iter()
        .enumerate()
        .filter_map(|(index, (encoding, _))| {
            let quality = quality_of(encoding)?;
            (quality > 0.0).then_some((quality, index))
        })
        .collect();
    accepted.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(left.1.cmp(&right.1))
    });
    accepted
        .into_iter()
        .map(|(_, index)| PRECOMPRESSED[index])
        .collect()
}

fn encoded_response(relative: &str, is_page: bool, encoding: &str, bytes: Vec<u8>) -> Response {
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type_of(relative, is_page)),
            (
                header::CACHE_CONTROL,
                if is_page {
                    PAGE_CACHE_CONTROL
                } else {
                    ASSETS_CACHE_CONTROL
                },
            ),
            (header::CONTENT_ENCODING, encoding),
            (header::VARY, "Accept-Encoding"),
        ],
        bytes,
    )
        .into_response()
}

fn plain(status: StatusCode, body: &str) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        body.to_owned(),
    )
        .into_response()
}

/// 产物内容类型按扩展名判断（Vite 产物集合内的稳定子集）。
fn content_type_of(relative: &str, is_page: bool) -> &'static str {
    if is_page || relative.ends_with(".html") {
        return "text/html; charset=utf-8";
    }
    let extension = relative.rsplit('.').next().unwrap_or_default();
    match extension {
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        "map" => "application/json",
        "xml" => "application/xml",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn static_files() -> StaticFiles {
        static NEXT_ROOT: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!(
            "product-static-{}-{}",
            std::process::id(),
            NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("assets")).unwrap();
        for relative in [
            "desktop/pages/public-home/index.html",
            "desktop/pages/admin-home/index.html",
            "desktop/pages/admin-editor-guide/index.html",
            "desktop/pages/admin-article-preview-desktop/index.html",
            "mobile/pages/home/index.html",
            "mobile/pages/admin-article-preview-content/index.html",
            "mobile/pages/settings/index.html",
        ] {
            let path = root.join(relative);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, format!("<html>{relative}</html>")).unwrap();
        }
        let routes = serde_json::json!([
            { "alias": "/", "outputPath": "desktop/pages/public-home/index.html" },
            { "alias": "/m", "outputPath": "mobile/pages/home/index.html" },
            { "alias": "/m/", "outputPath": "mobile/pages/home/index.html" },
            { "alias": "/m/settings/index.html", "outputPath": "mobile/pages/settings/index.html" },
            { "alias": "/admin", "outputPath": "desktop/pages/admin-home/index.html" },
            { "alias": "/admin/", "outputPath": "desktop/pages/admin-home/index.html" },
            { "alias": "/admin/index.html", "outputPath": "desktop/pages/admin-home/index.html" },
            { "alias": "/admin/editor-guide/index.html", "outputPath": "desktop/pages/admin-editor-guide/index.html" },
            { "alias": "/admin/articles/preview/desktop.html", "outputPath": "desktop/pages/admin-article-preview-desktop/index.html" },
            { "alias": "/admin/articles/preview/mobile.html", "outputPath": "mobile/pages/admin-article-preview-content/index.html" },
            { "alias": "/admin/articles/preview/mobile/content.html", "outputPath": "mobile/pages/admin-article-preview-content/index.html" }
        ]);
        std::fs::write(
            root.join(PAGE_ROUTES_MANIFEST),
            serde_json::to_vec(&routes).unwrap(),
        )
        .unwrap();
        std::fs::write(root.join("assets/app-abc123.js"), "console.log(1)").unwrap();
        StaticFiles::new(root)
    }

    async fn status_of(
        files: &StaticFiles,
        method: &Method,
        path: &str,
        accept_encoding: Option<&str>,
    ) -> (StatusCode, String, String, String, String, Vec<u8>) {
        let response = files.serve(method, path, accept_encoding).await;
        let status = response.status();
        let header_of = |name: &str| {
            response
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
                .to_owned()
        };
        let content_type = header_of("content-type");
        let cache_control = header_of("cache-control");
        let content_encoding = header_of("content-encoding");
        let vary = header_of("vary");
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        (
            status,
            content_type,
            cache_control,
            content_encoding,
            vary,
            bytes.to_vec(),
        )
    }

    #[tokio::test(flavor = "current_thread")]
    async fn serves_mapped_pages_assets_and_404_fallback() {
        let files = static_files();

        let (status, content_type, cache_control, _, vary, body) =
            status_of(&files, &Method::GET, "/", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/html"));
        assert_eq!(cache_control, "no-cache");
        assert_eq!(vary, "Accept-Encoding");
        assert_eq!(
            body,
            b"<html>desktop/pages/public-home/index.html</html>".to_vec()
        );

        // 无尾斜杠目录路径与显式 index 路径命中同一页面。
        for path in [
            "/m",
            "/m/",
            "/m/settings/index.html",
            "/admin",
            "/admin/",
            "/admin/index.html",
        ] {
            let (status, content_type, cache_control, _, _, _) =
                status_of(&files, &Method::GET, path, None).await;
            assert_eq!(status, StatusCode::OK, "path={path}");
            assert!(content_type.starts_with("text/html"), "path={path}");
            assert_eq!(cache_control, "no-cache", "path={path}");
        }

        let (status, content_type, _, _, _, body) =
            status_of(&files, &Method::GET, "/admin/editor-guide/index.html", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/html"));
        assert_eq!(
            body,
            b"<html>desktop/pages/admin-editor-guide/index.html</html>".to_vec()
        );

        for (path, expected) in [
            (
                "/admin/articles/preview/desktop.html",
                "desktop/pages/admin-article-preview-desktop/index.html",
            ),
            (
                "/admin/articles/preview/mobile.html",
                "mobile/pages/admin-article-preview-content/index.html",
            ),
            (
                "/admin/articles/preview/mobile/content.html",
                "mobile/pages/admin-article-preview-content/index.html",
            ),
        ] {
            let (status, content_type, _, _, _, body) =
                status_of(&files, &Method::GET, path, None).await;
            assert_eq!(status, StatusCode::OK, "path={path}");
            assert!(content_type.starts_with("text/html"), "path={path}");
            assert_eq!(
                body,
                format!("<html>{expected}</html>").into_bytes(),
                "path={path}"
            );
        }

        let (status, content_type, cache_control, content_encoding, vary, body) =
            status_of(&files, &Method::GET, "/assets/app-abc123.js", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/javascript"));
        assert_eq!(cache_control, "public, max-age=31536000, immutable");
        assert_eq!(content_encoding, "", "无 Accept-Encoding → 原始产物");
        assert_eq!(vary, "Accept-Encoding");
        assert_eq!(body, b"console.log(1)".to_vec());

        // 未知路径 / 目录穿越 / 缺失资源 → 404（text/plain，与 Go 参考实现一致）。
        for path in [
            "/articles/",
            "/articles/detail",
            "/m/articles/unknown",
            "/admin/articles/preview.html",
            "/assets/",
            "/assets/../desktop/pages/public-home/index.html",
            "/assets/nope.js",
        ] {
            let (status, content_type, _, _, _, body) =
                status_of(&files, &Method::GET, path, None).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "path={path}");
            assert!(content_type.starts_with("text/plain"), "path={path}");
            assert_eq!(body, b"404 page not found\n".to_vec(), "path={path}");
        }

        // 非 GET/HEAD → 405。
        let (status, _, _, _, _, _) = status_of(&files, &Method::POST, "/", None).await;
        assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);

        let _ = std::fs::remove_dir_all(files.root());
    }

    /// `zstdCompressSync(Buffer.from("console.log(1)"), { level: 19 })` 的
    /// 确定性输出（Node 24.x zlib；与构建期 compressArtifacts 同参数）。
    const FIXTURE_ZSTD: [u8; 23] = [
        40, 181, 47, 253, 32, 14, 113, 0, 0, 99, 111, 110, 115, 111, 108, 101, 46, 108, 111, 103,
        40, 49, 41,
    ];
    /// `gzipSync(Buffer.from("console.log(1)"), { level: 9 })` 的确定性输出。
    const FIXTURE_GZIP: [u8; 34] = [
        31, 139, 8, 0, 0, 0, 0, 0, 2, 19, 75, 206, 207, 43, 206, 207, 73, 213, 203, 201, 79, 215,
        48, 212, 4, 0, 104, 254, 1, 67, 14, 0, 0, 0,
    ];

    /// 预压缩协商：优先序、缺失变体回退、q=0 排除、Vary 标注。
    #[tokio::test(flavor = "current_thread")]
    async fn serves_precompressed_variants_by_accept_encoding() {
        let files = static_files();
        let root = files.root();
        // 磁盘上备齐 zstd 与 gzip 变体（缺 brotli，用于验证回退顺序）。
        std::fs::write(root.join("assets/app-abc123.js.zst"), FIXTURE_ZSTD).unwrap();
        std::fs::write(root.join("assets/app-abc123.js.gz"), FIXTURE_GZIP).unwrap();

        // 全部可接受 → 服务器偏好 zstd 优先，逐字节等于预压缩变体。
        let (status, _, _, content_encoding, vary, body) = status_of(
            &files,
            &Method::GET,
            "/assets/app-abc123.js",
            Some("zstd, br, gzip"),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_encoding, "zstd");
        assert_eq!(vary, "Accept-Encoding");
        assert_eq!(body, FIXTURE_ZSTD.to_vec());

        // zstd 被排除（q=0）→ 依接受度回退 gzip。
        let (_, _, _, content_encoding, _, body) = status_of(
            &files,
            &Method::GET,
            "/assets/app-abc123.js",
            Some("zstd;q=0, gzip"),
        )
        .await;
        assert_eq!(content_encoding, "gzip");
        assert_eq!(body, FIXTURE_GZIP.to_vec());

        // 只接受缺失的 br 变体 → 落到也接受的 gzip；仅有的变体缺失则回退原始产物。
        let (_, _, _, content_encoding, _, body) = status_of(
            &files,
            &Method::GET,
            "/assets/app-abc123.js",
            Some("br;q=0.8, gzip;q=0.5"),
        )
        .await;
        assert_eq!(content_encoding, "gzip");
        assert_eq!(body, FIXTURE_GZIP.to_vec());

        let (status, _, _, content_encoding, _, body) =
            status_of(&files, &Method::GET, "/assets/app-abc123.js", Some("br")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_encoding, "", "唯一可接受变体缺失 → 原始产物");
        assert_eq!(body, b"console.log(1)".to_vec());

        // 页面 HTML 同样参与协商。
        std::fs::write(root.join("mobile/pages/home/index.html.gz"), FIXTURE_GZIP).unwrap();
        let (status, content_type, _, content_encoding, _, body) =
            status_of(&files, &Method::GET, "/m", Some("gzip")).await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/html"));
        assert_eq!(content_encoding, "gzip");
        assert_eq!(body, FIXTURE_GZIP.to_vec());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn page_route_manifest_rejects_duplicate_and_unsafe_entries() {
        let root =
            std::env::temp_dir().join(format!("product-static-manifest-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        for (source, expected) in [
            (
                r#"[{"alias":"/same","outputPath":"a.html"},{"alias":"/same","outputPath":"b.html"}]"#,
                "duplicate page alias",
            ),
            (
                r#"[{"alias":"relative","outputPath":"a.html"}]"#,
                "invalid page alias",
            ),
            (
                r#"[{"alias":"/safe","outputPath":"../outside.html"}]"#,
                "invalid page output path",
            ),
        ] {
            std::fs::write(root.join(PAGE_ROUTES_MANIFEST), source).unwrap();
            let error = load_page_routes(&root).unwrap_err();
            assert!(error.contains(expected), "error={error}");
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn missing_route_manifest_fails_closed_but_keeps_assets_available() {
        let root = std::env::temp_dir().join(format!(
            "product-static-missing-manifest-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("assets/app.js"), "asset").unwrap();
        let files = StaticFiles::new(root);

        let (status, _, _, _, _, _) = status_of(&files, &Method::GET, "/", None).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        let (status, _, _, _, _, body) =
            status_of(&files, &Method::GET, "/assets/app.js", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"asset".to_vec());

        let _ = std::fs::remove_dir_all(files.root());
    }
}
