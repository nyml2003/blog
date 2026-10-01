import type { ResourceHandle } from "./resource.ts";

export interface CancellationFailure {
  readonly kind: "cancelled";
}

export interface CancellationSignal {
  readonly cancelled: boolean;
  subscribe(listener: () => void): ResourceHandle;
}

export interface CancellationSource {
  readonly signal: CancellationSignal;
  cancel(): void;
}

export const cancellationFailure = (): CancellationFailure => ({
  kind: "cancelled",
});

export function createCancellationSource(
  onCancel?: () => void,
): CancellationSource {
  let cancelled = false;
  const listeners = new Set<() => void>();
  const signal: CancellationSignal = {
    get cancelled() {
      return cancelled;
    },
    subscribe(listener) {
      if (cancelled) {
        listener();
        return { release() {} } satisfies ResourceHandle;
      }
      listeners.add(listener);
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          listeners.delete(listener);
        },
      } satisfies ResourceHandle;
    },
  };

  return {
    signal,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      onCancel?.();
      const current = Array.from(listeners);
      listeners.clear();
      for (const listener of current) listener();
    },
  };
}
