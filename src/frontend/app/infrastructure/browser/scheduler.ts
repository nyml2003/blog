import type { ResourceHandle, SchedulerPort } from "../../kernel/ports";

export interface BrowserSchedulerOptions {
  readonly queueMicrotaskFn: (callback: () => void) => void;
  readonly setTimeoutFn: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeoutFn: (handle: unknown) => void;
  readonly requestAnimationFrameFn: (
    callback: (timestamp: number) => void,
  ) => number;
  readonly cancelAnimationFrameFn: (handle: number) => void;
}

export function createBrowserScheduler(
  options: BrowserSchedulerOptions,
): SchedulerPort {
  return {
    microtask(callback) {
      let released = false;
      options.queueMicrotaskFn(() => {
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
      const handle = options.setTimeoutFn(() => {
        if (!released) callback();
      }, delayMs);
      return {
        release() {
          if (released) return;
          released = true;
          options.clearTimeoutFn(handle);
        },
      } satisfies ResourceHandle;
    },
    animationFrame(callback) {
      let released = false;
      const handle = options.requestAnimationFrameFn((timestamp) => {
        if (!released) callback(timestamp);
      });
      return {
        release() {
          if (released) return;
          released = true;
          options.cancelAnimationFrameFn(handle);
        },
      } satisfies ResourceHandle;
    },
  };
}
