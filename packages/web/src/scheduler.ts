import type { ResourceHandle } from "@fluvient-loom/common";
import type { SchedulerPort } from "@fluvient-loom/port";

type QueueMicrotaskLike = (callback: () => void) => void;
type SetTimeoutLike = (callback: () => void, delayMs: number) => unknown;
type ClearTimeoutLike = (handle: unknown) => void;
type RequestAnimationFrameLike = (
  callback: (timestamp: number) => void,
) => unknown;
type CancelAnimationFrameLike = (handle: unknown) => void;

export interface WebSchedulerOptions {
  readonly queueMicrotaskFn?: QueueMicrotaskLike;
  readonly setTimeoutFn?: SetTimeoutLike;
  readonly clearTimeoutFn?: ClearTimeoutLike;
  /** Web-standard rAF; falls back to `setTimeout(cb, 0)` when absent. */
  readonly requestAnimationFrameFn?: RequestAnimationFrameLike;
  readonly cancelAnimationFrameFn?: CancelAnimationFrameLike;
}

export function createWebScheduler(
  options: WebSchedulerOptions = {},
): SchedulerPort {
  const queueMicrotaskFn: QueueMicrotaskLike | undefined =
    options.queueMicrotaskFn ??
    (typeof queueMicrotask === "function" ? queueMicrotask : undefined);
  const setTimeoutFn: SetTimeoutLike | undefined =
    options.setTimeoutFn ??
    (typeof setTimeout === "function" ? setTimeout : undefined);
  const clearTimeoutFn: ClearTimeoutLike | undefined =
    options.clearTimeoutFn ??
    (typeof clearTimeout === "function"
      ? // Node's clearTimeout declaration rejects `unknown`; the handle is
        // always produced by the paired setTimeoutFn, so the cast is closed
        // within this adapter's type loop.
        (handle: unknown) =>
          clearTimeout(handle as Parameters<typeof clearTimeout>[0])
      : undefined);
  if (
    queueMicrotaskFn === undefined ||
    setTimeoutFn === undefined ||
    clearTimeoutFn === undefined
  ) {
    throw new Error(
      "createWebScheduler: 标准微任务/定时器不存在，须显式注入对应 options",
    );
  }
  const requestAnimationFrameFn: RequestAnimationFrameLike =
    options.requestAnimationFrameFn ??
    (typeof requestAnimationFrame === "function"
      ? (callback) =>
          requestAnimationFrame(callback as FrameRequestCallback)
      : (callback) => setTimeoutFn(() => callback(0), 0));
  const cancelAnimationFrameFn: CancelAnimationFrameLike =
    options.cancelAnimationFrameFn ??
    (typeof cancelAnimationFrame === "function"
      ? (handle: unknown) =>
          cancelAnimationFrame(handle as Parameters<typeof cancelAnimationFrame>[0])
      : (handle: unknown) => clearTimeoutFn(handle));

  return {
    microtask(callback) {
      let released = false;
      queueMicrotaskFn(() => {
        if (!released) callback();
      });
      return {
        release() {
          released = true;
        },
      } satisfies ResourceHandle;
    },
    delay(callback, delayMs) {
      let released = false;
      const handle = setTimeoutFn(() => {
        if (!released) callback();
      }, delayMs);
      return {
        release() {
          if (released) return;
          released = true;
          clearTimeoutFn(handle);
        },
      } satisfies ResourceHandle;
    },
    animationFrame(callback) {
      let released = false;
      const handle = requestAnimationFrameFn((timestamp) => {
        if (!released) callback(timestamp);
      });
      return {
        release() {
          if (released) return;
          released = true;
          cancelAnimationFrameFn(handle);
        },
      } satisfies ResourceHandle;
    },
  };
}
