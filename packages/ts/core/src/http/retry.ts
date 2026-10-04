import type { CancellationFailure } from "../cancellation.ts";
import type { Result } from "../result.ts";
import type { HttpError } from "./error.ts";

export interface HttpRetryPolicy {
  /** Total attempts including the first one. */
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  /** Exponential factor between attempts; defaults to 2. */
  readonly factor?: number;
}

export interface HttpRetryEvent {
  readonly attempt: number;
  readonly delayMs: number;
  readonly error: HttpError;
}

export interface HttpRetryHooks {
  /** Notified before each wait, so callers can surface retry progress. */
  readonly onRetry?: (event: HttpRetryEvent) => void;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isCancellation(error: HttpError | CancellationFailure): error is CancellationFailure {
  return (error as { kind?: string }).kind === "cancelled";
}

/**
 * Bounded exponential backoff over retryable transport failures. Cancellation
 * and non-retryable errors return immediately; retryability comes from the
 * kernel's classification, callers stay in charge via the hooks.
 */
export async function withHttpRetry<T>(
  run: () => Promise<Result<T, HttpError | CancellationFailure>>,
  policy: HttpRetryPolicy,
  hooks: HttpRetryHooks = {},
): Promise<Result<T, HttpError | CancellationFailure>> {
  const sleep = hooks.sleep ?? defaultSleep;
  const factor = policy.factor ?? 2;
  for (let attempt = 1; ; attempt += 1) {
    const result = await run();
    if (result.ok) return result;
    if (isCancellation(result.error)) return result;
    if (!result.error.retryable || attempt >= policy.maxAttempts) return result;
    const raw = policy.initialDelayMs * factor ** (attempt - 1);
    const delayMs = Math.min(raw, policy.maxDelayMs);
    hooks.onRetry?.({ attempt, delayMs, error: result.error });
    await sleep(delayMs);
  }
}
