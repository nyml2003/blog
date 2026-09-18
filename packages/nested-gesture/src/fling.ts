/**
 * The independent fling channel (Android's TYPE_NON_TOUCH): momentum that
 * outlives the touch. Exponential decay à la Compose — velocity halves
 * every tau — with interruption reporting so a nested parent can relay
 * whatever is left when the animation is cut short.
 */
export interface Fling {
  /** Displacement from the fling origin after `elapsedMs` (px). */
  positionAt(elapsedMs: number): number;
  /** Remaining velocity at `elapsedMs` (px/ms). */
  velocityAt(elapsedMs: number): number;
  /** Total displacement once the velocity decays to the floor (px). */
  distance(): number;
  /** Time until the velocity decays to the floor (ms). */
  settleDuration(): number;
  /**
   * Interruption report: where the fling IS at `elapsedMs` and what the
   * momentum still carries (a new touch or a parent takeover relays both
   * onward — the parent needs the position, not just the velocity).
   */
  remaining(elapsedMs: number): {
    velocityPxPerMs: number;
    positionPx: number;
  };
}

export const FLING_DECAY_TAU_MS = 160;
export const FLING_FLOOR_PX_PER_MS = 0.01;

export function createFling(input: {
  velocityPxPerMs: number;
  decayTauMs?: number;
  floorPxPerMs?: number;
}): Fling {
  const tau = input.decayTauMs ?? FLING_DECAY_TAU_MS;
  const floor = input.floorPxPerMs ?? FLING_FLOOR_PX_PER_MS;
  const v0 = input.velocityPxPerMs;
  // v(t) = v0 · e^(−t/τ);  x(t) = v0 · τ · (1 − e^(−t/τ))
  const velocityAt = (elapsedMs: number): number =>
    v0 * Math.exp(-elapsedMs / tau);
  // A fling already below the floor has nothing to decay: it settles
  // immediately (the raw log would go negative).
  const settleDuration = (): number =>
    v0 === 0 || Math.abs(v0) <= floor
      ? 0
      : Math.max(0, tau * Math.log(Math.abs(v0) / floor));
  return {
    positionAt(elapsedMs: number): number {
      return v0 * tau * (1 - Math.exp(-elapsedMs / tau));
    },
    velocityAt,
    distance(): number {
      return v0 * tau;
    },
    settleDuration,
    remaining(elapsedMs: number) {
      const v = velocityAt(elapsedMs);
      return {
        velocityPxPerMs: Math.abs(v) < floor ? 0 : v,
        positionPx: v0 * tau * (1 - Math.exp(-elapsedMs / tau)),
      };
    },
  };
}
