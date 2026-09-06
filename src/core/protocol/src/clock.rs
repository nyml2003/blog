//! 服务端时间字段（ARCH-DATA-API：客户端不能写入服务端时间字段）。
//!
//! 不引入日期库：RFC3339 UTC 由 `SystemTime` + 公历日历算法（Howard Hinnant
//! `civil_from_days`）本地生成；小数部分固定 9 位，因此字典序 == 时间序。
//!
//! Mock 复用同一实现：初始 seed 的时间戳是常量，只有管理端写入产生的
//! `created_at`/`updated_at`/`published_at` 使用真实时钟——与真实 Product 行为一致，
//! 让前端能观察到「服务端维护时间字段」。

use std::time::{SystemTime, UNIX_EPOCH};

/// 当前 UTC 时间，形如 `2026-09-06T04:20:31.123456789Z`。
pub fn now_utc_rfc3339() -> String {
    let since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = since_epoch.as_secs();
    let nanos = since_epoch.subsec_nanos();
    let days = (seconds / 86_400) as i64;
    let rest = seconds % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{hh:02}:{mm:02}:{ss:02}.{nanos:09}Z",
        hh = rest / 3_600,
        mm = (rest % 3_600) / 60,
        ss = rest % 60,
    )
}

/// 天数（自 1970-01-01）→ 公历日期。
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    (year, month as u32, day as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_is_1970_01_01() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19), (1970, 1, 20));
        assert_eq!(civil_from_days(59), (1970, 3, 1));
    }

    #[test]
    fn handles_leap_years() {
        // 2024-02-28 → 02-29（闰日），再 → 03-01。
        assert_eq!(civil_from_days(19_781), (2024, 2, 28));
        assert_eq!(civil_from_days(19_782), (2024, 2, 29));
        assert_eq!(civil_from_days(19_783), (2024, 3, 1));
    }

    #[test]
    fn formats_rfc3339_with_nanos() {
        let stamp = now_utc_rfc3339();
        let (date, time) = stamp.split_once('T').expect("date and time separated by T");
        let (year, rest) = date.split_once('-').expect("year-month");
        assert_eq!(year.len(), 4);
        assert_eq!(rest.split('-').count(), 2);
        assert!(time.ends_with('Z'));
        let clock = time.trim_end_matches('Z');
        assert_eq!(clock.split(':').count(), 3, "hh:mm:ss(.fraction): {clock}");
        assert!(clock.contains('.'), "fractional seconds present: {clock}");
    }

    #[test]
    fn stamps_are_monotonic_by_string_order() {
        // 相同秒内只有小数部分不同：9 位零填充保证字典序 == 时间序。
        let a = "2026-09-06T04:20:31.000000000Z";
        let b = "2026-09-06T04:20:31.000000001Z";
        assert!(a < b);
    }
}
