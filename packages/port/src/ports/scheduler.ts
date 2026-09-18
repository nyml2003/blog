import type { ResourceHandle } from "@fluvient-loom/common";

export interface SchedulerPort {
  microtask(callback: () => void): ResourceHandle;
  delay(callback: () => void, delayMs: number): ResourceHandle;
  animationFrame(callback: (timestamp: number) => void): ResourceHandle;
}
