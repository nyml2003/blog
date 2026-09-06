//! `web/dist` 静态挂载（SPEC-OPS-RUNTIME-001-MODE-004）。
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
//! SPIKE-001（回退行为观察）见 `WORKSTREAM-OPS-RUNTIME-BACKEND.md` 交付记录。

use std::collections::HashMap;
use std::path::PathBuf;

use axum::http::{Method, StatusCode, header};
use axum::response::{IntoResponse, Response};

/// Go 参考实现的页面映射（Vite 产物在 `web/dist` 下的相对路径）。
const PAGES: &[(&str, &str)] = &[
    ("/", "desktop/pages/public-home/index.html"),
    (
        "/articles/index.html",
        "desktop/pages/public-articles/index.html",
    ),
    (
        "/articles/detail.html",
        "desktop/pages/public-detail/index.html",
    ),
    ("/m", "mobile/pages/home/index.html"),
    ("/m/", "mobile/pages/home/index.html"),
    ("/m/articles/index.html", "mobile/pages/articles/index.html"),
    (
        "/m/articles/detail.html",
        "mobile/pages/article-detail/index.html",
    ),
    ("/admin", "desktop/pages/admin-home/index.html"),
    ("/admin/", "desktop/pages/admin-home/index.html"),
    ("/admin/index.html", "desktop/pages/admin-home/index.html"),
    (
        "/admin/articles/new.html",
        "desktop/pages/admin-article-new/index.html",
    ),
    (
        "/admin/articles/edit.html",
        "desktop/pages/admin-article-edit/index.html",
    ),
    (
        "/admin/editor-guide/index.html",
        "desktop/pages/admin-editor-guide/index.html",
    ),
    (
        "/admin/article-types/index.html",
        "desktop/pages/admin-article-types/index.html",
    ),
    (
        "/admin/terms/index.html",
        "desktop/pages/admin-terms/index.html",
    ),
];

const ASSETS_PREFIX: &str = "/assets/";

#[derive(Clone)]
pub struct StaticFiles {
    root: PathBuf,
    pages: HashMap<&'static str, &'static str>,
}

impl StaticFiles {
    /// `root` 为 ops 注入的 `BLOG_WEB_DIR`（仓库内 `web/dist` 绝对路径）。
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            pages: PAGES.iter().copied().collect(),
        }
    }

    pub fn root(&self) -> &std::path::Path {
        &self.root
    }

    /// 静态解析入口；未知路径、目录路径、深层刷新路径都到这里。
    pub async fn serve(&self, method: &Method, path: &str) -> Response {
        if method != Method::GET && method != Method::HEAD {
            return plain(StatusCode::METHOD_NOT_ALLOWED, "method not allowed\n");
        }
        // 精确页面映射（含 `/m`、`/admin` 这类无尾斜杠目录路径）。
        if let Some(relative) = self.pages.get(path) {
            return self.read_file(relative, true).await;
        }
        if let Some(asset) = path.strip_prefix(ASSETS_PREFIX) {
            if asset.is_empty() || asset.contains("..") || asset.contains('\\') {
                return plain(StatusCode::NOT_FOUND, "404 page not found\n");
            }
            return self.read_file(&format!("assets/{asset}"), false).await;
        }
        plain(StatusCode::NOT_FOUND, "404 page not found\n")
    }

    async fn read_file(&self, relative: &str, is_page: bool) -> Response {
        let path = self.root.join(relative);
        match tokio::fs::read(&path).await {
            Ok(bytes) => {
                let content_type = content_type_of(relative, is_page);
                (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, content_type)],
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

    fn static_files() -> StaticFiles {
        let root = std::env::temp_dir().join(format!("product-static-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("assets")).unwrap();
        for relative in [
            "desktop/pages/public-home/index.html",
            "desktop/pages/admin-home/index.html",
            "desktop/pages/admin-editor-guide/index.html",
            "mobile/pages/home/index.html",
        ] {
            let path = root.join(relative);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, format!("<html>{relative}</html>")).unwrap();
        }
        std::fs::write(root.join("assets/app-abc123.js"), "console.log(1)").unwrap();
        StaticFiles::new(root)
    }

    async fn status_of(
        files: &StaticFiles,
        method: &Method,
        path: &str,
    ) -> (StatusCode, String, String) {
        let response = files.serve(method, path).await;
        let status = response.status();
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_owned();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        (
            status,
            content_type,
            String::from_utf8_lossy(&bytes).to_string(),
        )
    }

    #[tokio::test(flavor = "current_thread")]
    async fn serves_mapped_pages_assets_and_404_fallback() {
        let files = static_files();

        let (status, content_type, body) = status_of(&files, &Method::GET, "/").await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/html"));
        assert_eq!(body, "<html>desktop/pages/public-home/index.html</html>");

        // 无尾斜杠目录路径与 `/admin/index.html` 命中同一页面。
        for path in ["/m", "/m/", "/admin", "/admin/", "/admin/index.html"] {
            let (status, content_type, _) = status_of(&files, &Method::GET, path).await;
            assert_eq!(status, StatusCode::OK, "path={path}");
            assert!(content_type.starts_with("text/html"), "path={path}");
        }

        let (status, content_type, body) =
            status_of(&files, &Method::GET, "/admin/editor-guide/index.html").await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/html"));
        assert_eq!(
            body,
            "<html>desktop/pages/admin-editor-guide/index.html</html>"
        );

        let (status, content_type, body) =
            status_of(&files, &Method::GET, "/assets/app-abc123.js").await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/javascript"));
        assert_eq!(body, "console.log(1)");

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
            let (status, content_type, body) = status_of(&files, &Method::GET, path).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "path={path}");
            assert!(content_type.starts_with("text/plain"), "path={path}");
            assert_eq!(body, "404 page not found\n", "path={path}");
        }

        // 非 GET/HEAD → 405。
        let (status, _, _) = status_of(&files, &Method::POST, "/").await;
        assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);

        let _ = std::fs::remove_dir_all(files.root());
    }
}
