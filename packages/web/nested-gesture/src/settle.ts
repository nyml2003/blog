import { createFling, FLING_DECAY_TAU_MS } from "./fling";

/**
 * Release-time settlement.
 *
 * projectSettlement is the physics model: the release velocity is a
 * DISTANCE signal (how far the momentum would still carry), so position
 * and velocity collapse into one quantity — the projected landing point —
 * and the threshold model's dead zones disappear. It degrades to pure
 * nearest-position snapping at projectionMs = 0 (the rollback switch).
 */

export interface SnapPoint<T> {
  /** The snap's real position in percent (not an index). */
  readonly at: number;
  readonly target: T;
}

export interface ProjectSettlementInput<T> {
  readonly positionPercent: number;
  readonly velocityPxPerMs: number;
  /** Viewport size in px — the projection is viewport-normalized so the
   * time parameters mean the same thing on every device. */
  readonly viewportPx: number;
  readonly snaps: readonly SnapPoint<T>[];
  /** Prediction horizon in ms: how far to extrapolate the velocity. */
  readonly projectionMs: number;
  /**
   * Risk pricing: per-snap horizon override. A snap whose horizon is
   * SHORTER than projectionMs is "risk-priced": the projection may only
   * land on it if the momentum, extrapolated with THAT horizon, actually
   * reaches it — otherwise the projection caps at the snap's near region
   * boundary (the midpoint toward the neighbouring snap), wherever the
   * release started from, not merely from the adjacent snap.
   */
  readonly snapHorizon?: (snap: SnapPoint<T>) => number;
  /** Velocities below the floor are sampling noise, not intent. */
  readonly noiseFloorPxPerMs?: number;
  /** Decay time constant for the remaining-momentum report. */
  readonly decayTauMs?: number;
}

export interface ProjectedSettlement<T> {
  readonly target: T;
  /**
   * Momentum left over when the projection ran past an end snap, reported
   * as the fling's instantaneous velocity at the edge crossing (a
   * physical quantity under the exponential decay model) — the "I hit the
   * edge with velocity to spare" signal a nested parent may relay. Zero
   * when the landing point is interior or the fling settles first.
   */
  readonly remainingVelocityPxPerMs: number;
  /** The projected landing point (risk-capped, clamped into snap range). */
  readonly projectedPercent: number;
}

export const NOISE_FLOOR_PX_PER_MS = 0.05;

export function projectSettlement<T>(
  input: ProjectSettlementInput<T>,
): ProjectedSettlement<T> {
  if (input.snaps.length === 0) {
    throw new Error("projectSettlement requires at least one snap");
  }
  const noiseFloor = input.noiseFloorPxPerMs ?? NOISE_FLOOR_PX_PER_MS;
  const velocity =
    Math.abs(input.velocityPxPerMs) < noiseFloor
      ? 0
      : input.velocityPxPerMs;
  if (input.viewportPx <= 0 || velocity === 0 || input.projectionMs === 0) {
    return {
      target: nearestSnap(input.snaps, input.positionPercent).target,
      remainingVelocityPxPerMs: 0,
      projectedPercent: input.positionPercent,
    };
  }
  const decayTauMs = input.decayTauMs ?? FLING_DECAY_TAU_MS;

  const travel = velocity > 0 ? 1 : -1;
  const sorted = [...input.snaps].sort((a, b) => a.at - b.at);
  const minAt = sorted[0]!.at;
  const maxAt = sorted[sorted.length - 1]!.at;
  const naive = input.positionPercent +
    (velocity * input.projectionMs * 100) / input.viewportPx;

  // Risk capping: walk the priced snaps in travel order; a priced snap the
  // projection reached must be attainable under its own horizon, else the
  // projection retreats to that snap's near region boundary.
  let effective = Math.min(maxAt, Math.max(minAt, naive));
  for (let index = 0; index < sorted.length; index += 1) {
    const snap = sorted[index]!;
    const horizon = input.snapHorizon?.(snap) ?? input.projectionMs;
    if (horizon >= input.projectionMs) continue; // not risk-priced
    if ((snap.at - input.positionPercent) * travel <= 0) continue; // behind
    const regionNear =
      index === 0
        ? Number.NEGATIVE_INFINITY
        : (sorted[index - 1]!.at + snap.at) / 2;
    const reached =
      travel > 0 ? effective >= regionNear : effective <= regionNear;
    if (!reached) continue;
    const needed = Math.abs(snap.at - input.positionPercent);
    const carry =
      (Math.abs(velocity) * horizon * 100) / input.viewportPx;
    if (carry >= needed) continue; // attainable under its own horizon
    if ((input.positionPercent - regionNear) * travel > 0) {
      // Released already inside the snap's region: proximity rules.
      continue;
    }
    effective = regionNear;
  }

  // Remaining momentum: when the uncapped projection ran past an end
  // snap, solve the decay for the edge-crossing time and report the
  // instantaneous velocity there — not a heuristic leftover/horizon ratio.
  const end = travel > 0 ? maxAt : minAt;
  const pastEnd = travel > 0 ? naive - end : end - naive;
  let remaining = 0;
  if (pastEnd > 0) {
    const fling = createFling({
      velocityPxPerMs: velocity,
      decayTauMs,
      floorPxPerMs: 0,
    });
    const totalPx = fling.distance();
    const edgePx = (Math.abs(end - input.positionPercent) / 100) *
      input.viewportPx;
    if (edgePx < totalPx) {
      // x(t) = v0·τ·(1−e^(−t/τ)) = d  →  t = −τ·ln(1−d/(v0·τ))
      const edgeTime = -decayTauMs * Math.log(1 - edgePx / totalPx);
      remaining = fling.velocityAt(edgeTime);
    }
  }
  if (Math.abs(remaining) < noiseFloor) remaining = 0;

  return {
    target: nearestSnap(input.snaps, effective).target,
    remainingVelocityPxPerMs: remaining,
    projectedPercent: effective,
  };
}

function nearestSnap<T>(
  snaps: readonly SnapPoint<T>[],
  percent: number,
): SnapPoint<T> {
  return snaps.reduce((best, snap) =>
    Math.abs(snap.at - percent) < Math.abs(best.at - percent) ? snap : best,
  );
}

/* ------------------------------------------------------------------ *
 * Superseded threshold model — kept exported for compatibility and as
 * the documented degenerate reference.
 * ------------------------------------------------------------------ */

/**
 * Nearest-snap settlement; a deliberate fling outranks release position.
 * The 1.0 px/ms (≈1000 px/s) floor follows Material's fling threshold.
 * Superseded by projectSettlement (the physics model this one degenerates
 * from); kept for callers that want the discrete classifier.
 */
export function snapOnRelease<T>(input: {
  percent: number;
  velocity: number;
  full: T;
  half: T;
  close: T;
}): T {
  if (input.velocity >= 1.0) return input.close;
  if (input.velocity <= -1.0) return input.full;
  if (input.percent >= 70) return input.close;
  if (input.percent <= 25) return input.full;
  return input.half;
}

/**
 * Touch-slop for flings (Material analogue): a velocity verdict only
 * counts when the container itself travelled during THIS gesture.
 * Superseded by projectSettlement's noiseFloor (which absorbs sampling
 * noise at the source); kept for the same reason as snapOnRelease.
 */
export function flingWithSlop(
  velocity: number,
  travelDeltaPercent: number,
): number {
  return Math.abs(travelDeltaPercent) < 4 ? 0 : velocity;
}

/** Drag progress mapped to a clamped 0–100 travel percent. A
 * non-positive viewport collapses to the base (nothing can be derived
 * from it). */
export function dragPercent(
  basePercent: number,
  deltaPx: number,
  viewportPx: number,
): number {
  if (viewportPx <= 0) return basePercent;
  const deltaPercent = (deltaPx / viewportPx) * 100;
  return Math.min(100, Math.max(0, basePercent + deltaPercent));
}
