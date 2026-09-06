//! `[mock]` 前缀日志（SPEC-OPS-RUNTIME-001-LOG-001）。
//!
//! 与 `[product]`/`[data]` 同一实现约定：每行一个前缀、单次写入、无 logging facade。
//! 宏体自带 `use ::std::io::Write as _;`，调用方无需引入 trait。
//! 不用 `tracing`/`log`：ops 逐行转发 stdout/stderr 并按来源加前缀，宏已足够。

/// 常规进度与请求日志 → stdout。
#[macro_export]
macro_rules! mock_info {
    ($($arg:tt)+) => {{
        use ::std::io::Write as _;
        let mut out = ::std::io::stdout().lock();
        let _ = ::std::writeln!(out, "[mock] {}", ::std::format_args!($($arg)+));
        let _ = out.flush();
    }};
}

/// 失败与致命错误 → stderr。
#[macro_export]
macro_rules! mock_error {
    ($($arg:tt)+) => {{
        use ::std::io::Write as _;
        let mut err = ::std::io::stderr().lock();
        let _ = ::std::writeln!(err, "[mock] {}", ::std::format_args!($($arg)+));
        let _ = err.flush();
    }};
}
