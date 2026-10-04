import type { MotionSample } from "./velocity";

/**
 * LSQ2 velocity tracking (Android VelocityTracker / Chromium strategy):
 * a least-squares quadratic fit over the trailing window, evaluated at the
 * NEWEST sample — robust to the single-point jitter that a plain
 * endpoint-chord average amplifies. With fewer than three usable samples
 * it degrades to the chord, then to zero.
 */
export interface VelocityTracker {
  add(time: number, position: number): void;
  /**
   * Velocity in px/ms multiplied by `units` (Android
   * `computeCurrentVelocity(units)` convention — pass 1000 for px/s).
   */
  velocityAt(now: number, units?: number): number;
}

export const TRACKER_WINDOW_MS = 100;

export function createVelocityTracker(options?: {
  windowMs?: number;
}): VelocityTracker {
  const windowMs = options?.windowMs ?? TRACKER_WINDOW_MS;
  const samples: MotionSample[] = [];

  return {
    add(time, position) {
      samples.push({ time, position });
      while (
        samples.length > 1 &&
        samples[0]!.time < time - windowMs
      ) {
        samples.shift();
      }
    },
    velocityAt(now, units = 1) {
      const inWindow = samples.filter(
        (sample) => sample.time >= now - windowMs,
      );
      if (inWindow.length < 2) return 0;
      const last = inWindow[inWindow.length - 1]!;
      if (inWindow.length === 2) {
        const first = inWindow[0]!;
        if (last.time <= first.time) return 0;
        return (
          ((last.position - first.position) / (last.time - first.time)) *
          units
        );
      }
      // Quadratic least squares about the newest sample's time: solving in
      // t' = t - t_last keeps the numbers small and makes the velocity the
      // linear coefficient directly (v(t_last) = b).
      const n = inWindow.length;
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      let s4 = 0;
      let u0 = 0;
      let u1 = 0;
      let u2 = 0;
      for (const sample of inWindow) {
        const t = sample.time - last.time;
        const p = sample.position;
        s0 += 1;
        s1 += t;
        s2 += t * t;
        s3 += t * t * t;
        s4 += t * t * t * t;
        u0 += p;
        u1 += t * p;
        u2 += t * t * p;
      }
      // Normal equations for p = a + b·t + c·t²; solve the 3×3 via Cramer.
      const det =
        s0 * (s2 * s4 - s3 * s3) -
        s1 * (s1 * s4 - s3 * s2) +
        s2 * (s1 * s3 - s2 * s2);
      if (det === 0) return 0;
      // Cramer for the linear coefficient: replace column 2 of the normal
      // matrix with U, expand along the first row.
      const b =
        (s0 * (u1 * s4 - s3 * u2) -
          u0 * (s1 * s4 - s3 * s2) +
          s2 * (s1 * u2 - s2 * u1)) /
        det;
      return b * units;
    },
  };
}
