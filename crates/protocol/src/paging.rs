//! 分页归一化（与 Go 参考实现 `max1` / `max20` 保持一致的行为）。
//!
//! 放在 `protocol` 里是为了让 Product 在响应中回显与 Data 实际使用值完全相同的
//! `page` / `page_size` / `has_more`，避免两侧各自归一化造成不一致。

pub const DEFAULT_PAGE: u32 = 1;
pub const DEFAULT_PAGE_SIZE: u32 = 20;
pub const MAX_PAGE_SIZE: u32 = 100;

/// `page < 1` 归一化为 `1`。
pub fn normalize_page(page: Option<u32>) -> u32 {
    match page {
        Some(0) | None => DEFAULT_PAGE,
        Some(n) => n,
    }
}

/// `page_size` 缺省 `20`，上限 `100`。
pub fn normalize_page_size(page_size: Option<u32>) -> u32 {
    match page_size {
        Some(0) | None => DEFAULT_PAGE_SIZE,
        Some(n) if n > MAX_PAGE_SIZE => MAX_PAGE_SIZE,
        Some(n) => n,
    }
}

/// `page * page_size < total`（Go 参考实现同式）。
pub fn has_more(page: u32, page_size: u32, total: i64) -> bool {
    (i64::from(page) * i64::from(page_size)) < total
}
