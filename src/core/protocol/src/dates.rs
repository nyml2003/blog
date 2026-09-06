//! 日期过滤的排他终点计算。
//!
//! 与已移除的 Go 参考实现行为对齐（2026-09-06 退场）：`YYYY-MM-DD` → 次日
//! `YYYY-MM-DD`，使 `updated_to=2026-09-05` 表示「2026-09-05 全天」，比较保持
//! 字符串序。无法解析时原样返回（Go 参考实现同行为：退化为普通字符串比较）。
//!
//! 不引入日期库：这里只需要公历日历推进（含闰年规则）。

/// 次日（`YYYY-MM-DD`）；输入非法时原样返回。
pub fn exclusive_date_end(value: &str) -> String {
    let Some((year, month, day)) = parse_ymd(value) else {
        return value.to_owned();
    };
    let (year, month, day) = if day < days_in_month(year, month) {
        (year, month, day + 1)
    } else if month < 12 {
        (year, month + 1, 1)
    } else {
        (year + 1, 1, 1)
    };
    format!("{year:04}-{month:02}-{day:02}")
}

fn parse_ymd(value: &str) -> Option<(i32, u32, u32)> {
    let mut parts = value.split('-');
    let year = parts.next()?.parse::<i32>().ok()?;
    let month = parts.next()?.parse::<u32>().ok()?;
    let day = parts.next()?.parse::<u32>().ok()?;
    if parts.next().is_some() || !(1..=12).contains(&month) || day == 0 {
        return None;
    }
    if day > days_in_month(year, month) {
        return None;
    }
    Some((year, month, day))
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::exclusive_date_end;

    #[test]
    fn advances_day_month_and_year() {
        assert_eq!(exclusive_date_end("2026-09-05"), "2026-09-06");
        assert_eq!(exclusive_date_end("2026-09-30"), "2026-10-01");
        assert_eq!(exclusive_date_end("2026-12-31"), "2027-01-01");
        assert_eq!(exclusive_date_end("2024-02-28"), "2024-02-29");
        assert_eq!(exclusive_date_end("2024-02-29"), "2024-03-01");
        assert_eq!(exclusive_date_end("2026-02-28"), "2026-03-01");
    }

    #[test]
    fn falls_back_to_raw_value_when_unparsable() {
        assert_eq!(exclusive_date_end(""), "");
        assert_eq!(exclusive_date_end("not-a-date"), "not-a-date");
        assert_eq!(exclusive_date_end("2026-13-01"), "2026-13-01");
        assert_eq!(exclusive_date_end("2026-02-30"), "2026-02-30");
        assert_eq!(
            exclusive_date_end("2026-09-05T10:00:00Z"),
            "2026-09-05T10:00:00Z"
        );
    }
}
