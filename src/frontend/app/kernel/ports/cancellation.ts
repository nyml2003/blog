import type { ResourceHandle } from "./resource";

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
