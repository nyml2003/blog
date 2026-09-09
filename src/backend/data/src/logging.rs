//! `[data]` 前缀日志。
//!
//! 不引入 logging facade：ops 会逐行转发子进程输出并按前缀归组，
//! 因此这里只需要「每行一个前缀 + 单次写入」，不需要 level 过滤。
//! 宏体自带 `use ::std::io::Write as _;`，调用方无需引入 trait。

/// 常规进度与诊断日志 → stdout。
#[macro_export]
macro_rules! data_info {
    ($($arg:tt)+) => {{
        use ::std::io::Write as _;
        let mut out = ::std::io::stdout().lock();
        let _ = ::std::writeln!(out, "[data] {}", ::std::format_args!($($arg)+));
        let _ = out.flush();
    }};
}

/// 失败与致命错误 → stderr（ops 的失败路径诊断会读这一路）。
#[macro_export]
macro_rules! data_error {
    ($($arg:tt)+) => {{
        use ::std::io::Write as _;
        let mut err = ::std::io::stderr().lock();
        let _ = ::std::writeln!(err, "[data] {}", ::std::format_args!($($arg)+));
        let _ = err.flush();
    }};
}
