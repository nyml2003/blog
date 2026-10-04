/** Motion sampling + trailing-window velocity (px/ms). */

export interface MotionSample {
  readonly time: number;
  readonly position: number;
}

export const VELOCITY_WINDOW_MS = 120;

/**
 * Samples must be in ascending time order (the session guarantees it).
 * When nothing falls inside the trailing window — e.g. the finger paused
 * before release — the velocity is 0, not a stale average.
 */
export function sampleVelocity(
  samples: readonly MotionSample[],
  now: number,
  windowMs: number = VELOCITY_WINDOW_MS,
): number {
  const last = samples[samples.length - 1];
  if (last === undefined) return 0;
  let first: MotionSample | undefined;
  for (const sample of samples) {
    if (sample.time >= now - windowMs) {
      first = sample;
      break;
    }
  }
  if (first === undefined || last.time <= first.time) return 0;
  return (last.position - first.position) / (last.time - first.time);
}
