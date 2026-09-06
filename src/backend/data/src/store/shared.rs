//! 两个后端共享的 diagnostic operations（不触数据库，用于链路与取消/背压验证）。

use std::time::Duration;

use protocol::envelope::codes;
use protocol::{
    DiagnosticDigest, DiagnosticDigestResult, DiagnosticEcho, DiagnosticEchoResult, DiagnosticSlow,
    DiagnosticSlowResult, OperationFailure,
};

use super::OpCtx;

/// `diagnostic.slow` 批次上限：防止把进程变成纯 sleeper。
const MAX_BATCHES: u32 = 100_000;
/// `diagnostic.digest` 轮数上限：CPU lane 只有 1 个线程，必须可预期地让出。
const MAX_DIGEST_ROUNDS: u32 = 50_000;

pub fn diagnostic_echo(query: &DiagnosticEcho) -> DiagnosticEchoResult {
    DiagnosticEchoResult {
        message: query.message.clone(),
        byte_len: query.message.len(),
    }
}

/// 长循环 = 批次推进；**批次间隙**检查取消信号与剩余预算。
///
/// 这是协作式取消的最小可复现形态（PLAN 验收 9）：检测到取消立即返回，
/// worker 回到 `recv()`，线程不退出。
pub fn diagnostic_slow(
    query: &DiagnosticSlow,
    ctx: &OpCtx<'_>,
) -> Result<DiagnosticSlowResult, OperationFailure> {
    let batches = query.batches.min(MAX_BATCHES);
    let batch = Duration::from_millis(query.batch_ms);
    let mut completed = 0u32;
    while completed < batches {
        if ctx.canceled() {
            return Ok(DiagnosticSlowResult {
                batches_requested: batches,
                batches_completed: completed,
                batch_ms: query.batch_ms,
                canceled: true,
            });
        }
        let remaining = ctx.remaining();
        if remaining.is_zero() {
            return Err(OperationFailure::new(
                codes::DEADLINE_EXCEEDED,
                format!("diagnostic_slow budget exhausted after {completed}/{batches} batches"),
            ));
        }
        std::thread::sleep(batch.min(remaining));
        completed += 1;
    }
    Ok(DiagnosticSlowResult {
        batches_requested: batches,
        batches_completed: completed,
        batch_ms: query.batch_ms,
        canceled: false,
    })
}

/// FNV-1a 64 位摘要；多轮并在每轮混入自身结果，构成可度量的纯 CPU 负载。
pub fn diagnostic_digest(query: &DiagnosticDigest) -> DiagnosticDigestResult {
    let rounds = query.rounds.clamp(1, MAX_DIGEST_ROUNDS);
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for _ in 0..rounds {
        for byte in query.input.as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
        for byte in hash.to_le_bytes() {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    DiagnosticDigestResult {
        rounds,
        input_len: query.input.len(),
        digest: format!("{hash:016x}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executor::{CancelCheck, JobResult};
    use crate::store::Meter;
    use protocol::DiagnosticSlow;
    use tokio::sync::oneshot;

    fn ctx<'a>(
        budget: Duration,
        reply: &'a oneshot::Sender<JobResult>,
        meter: &'a Meter,
    ) -> OpCtx<'a> {
        OpCtx {
            budget,
            cancel: CancelCheck::new(reply),
            meter,
            started: std::time::Instant::now(),
        }
    }

    #[test]
    fn slow_stops_at_batch_boundary_when_canceled() {
        let (tx, rx) = oneshot::channel::<JobResult>();
        drop(rx); // 取消信号：回程通道关闭
        let meter = Meter::new();
        let context = ctx(Duration::from_secs(5), &tx, &meter);
        let result = diagnostic_slow(
            &DiagnosticSlow {
                batches: 100,
                batch_ms: 20,
            },
            &context,
        )
        .unwrap();
        assert!(result.canceled);
        assert_eq!(result.batches_completed, 0);
    }

    #[test]
    fn slow_reports_deadline_when_budget_exhausted() {
        let (tx, _rx) = oneshot::channel::<JobResult>();
        let meter = Meter::new();
        let context = ctx(Duration::from_millis(30), &tx, &meter);
        let failure = diagnostic_slow(
            &DiagnosticSlow {
                batches: 100,
                batch_ms: 50,
            },
            &context,
        )
        .unwrap_err();
        assert_eq!(failure.code, codes::DEADLINE_EXCEEDED);
    }

    #[test]
    fn slow_completes_all_batches_when_not_canceled() {
        let (tx, _rx) = oneshot::channel::<JobResult>();
        let meter = Meter::new();
        let context = ctx(Duration::from_secs(5), &tx, &meter);
        let result = diagnostic_slow(
            &DiagnosticSlow {
                batches: 3,
                batch_ms: 1,
            },
            &context,
        )
        .unwrap();
        assert!(!result.canceled);
        assert_eq!(result.batches_completed, 3);
    }

    #[test]
    fn digest_is_deterministic_and_bounded() {
        let base = DiagnosticDigest {
            input: "blog".to_owned(),
            rounds: 4,
        };
        assert_eq!(diagnostic_digest(&base), diagnostic_digest(&base));
        assert_eq!(diagnostic_digest(&base).rounds, 4);
        assert_eq!(
            diagnostic_digest(&DiagnosticDigest {
                rounds: 0,
                ..base.clone()
            })
            .rounds,
            1
        );
        assert_eq!(
            diagnostic_digest(&DiagnosticDigest {
                rounds: u32::MAX,
                ..base
            })
            .rounds,
            MAX_DIGEST_ROUNDS
        );
    }

    #[test]
    fn echo_reports_length() {
        let result = diagnostic_echo(&DiagnosticEcho {
            message: "ping".to_owned(),
        });
        assert_eq!(result.byte_len, 4);
        assert_eq!(result.message, "ping");
    }
}
