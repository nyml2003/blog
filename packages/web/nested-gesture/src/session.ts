import {
  createVelocityTracker,
  type VelocityTracker,
} from "./tracker";

/**
 * NestedGesture child-role state machine: one gesture session, the
 * three-phase consumption protocol (parent pre → child → remainder offer
 * to parent post), single-owner lock.
 *
 * The machine is position-stream driven and side-effect free apart from
 * the two consumption delegations: `preConsume` (the parent eats first —
 * collapsing headers, pull-to-refresh) and `consumeToStart` (locked-mode
 * child scrolling toward its start bound), both mirroring Android
 * NestedScroll's consumed dispatch. Velocity comes from an LSQ2 tracker.
 */

export type HandOverDirection = "up" | "down";

export const HAND_OVER_THRESHOLD = 4;

/**
 * Public decision helper (also drives the session's unlocked branch, fed
 * the accumulated drift): a downward drag offers the parent only at the
 * child's start bound; an upward drag offers immediately (the parent may
 * decline, in which case the child keeps the gesture). Both modes use the
 * cumulative drift baseline — the industry touch-slop semantics — with
 * the adapter guarding `preventDefault` on cancelable only, so a pan the
 * browser has already committed is never raced.
 */
export function handOverDecision(input: {
  delta: number;
  atStartBound: boolean;
  threshold?: number;
}): HandOverDirection | undefined {
  const threshold = input.threshold ?? HAND_OVER_THRESHOLD;
  if (input.delta > threshold && input.atStartBound) return "down";
  if (input.delta < -threshold) return "up";
  return undefined;
}

/** How a move's displacement was split across the protocol phases. */
export interface ConsumedBreakdown {
  /** Eaten by the parent BEFORE the child (pre phase, signed). */
  readonly pre: number;
  /** Eaten by the child (signed). */
  readonly child: number;
  /** Neither consumed — accumulated as drift or handed to the parent. */
  readonly remainder: number;
}

export type ChainMove =
  /** The child consumes this move (native or delegated scroll). */
  | { kind: "child"; consumed: ConsumedBreakdown }
  /**
   * Locked mode: the child consumed toward its start bound via
   * `consumeToStart`. `reached` says whether the bound was met.
   */
  | {
      kind: "scroll-back";
      step: number;
      reached: boolean;
      consumed: ConsumedBreakdown;
    }
  /** Offer the gesture to the parent; the caller dispatches and MUST
   * then accept (session.accept) or decline (session.rearm) before the
   * next move — an unanswered offer leaves the drift accumulating and
   * will offer again. */
  | { kind: "offer"; direction: HandOverDirection }
  /** The parent owns the session: direction-clamped tracking delta. */
  | { kind: "track"; direction: HandOverDirection; delta: number };

export interface ChainMoveInput {
  readonly position: number;
  readonly time: number;
  /** Locked children never hand vertical pans to the platform; the
   * session decides consumption and offers itself. */
  readonly locked: boolean;
  /** Whether the child currently sits at its effective start bound. */
  readonly atStartBound: boolean;
  /**
   * Pre phase: the parent consumes FIRST (signed px it takes, clamped to
   * the move's step); the remainder flows to the child.
   */
  readonly preConsume?: (step: number) => number;
  /**
   * Locked-mode delegation: apply `step` px of consumption toward the
   * start bound; return whether the bound is now reached. Absent means
   * "not reached" (nothing was consumed). NOTE: the delegate reports a
   * boolean, not the exact amount consumed — the breakdown records the
   * requested `step` (an accepted approximation, unlike preConsume's
   * explicit amount).
   */
  readonly consumeToStart?: (step: number) => boolean;
  readonly threshold?: number;
}

export interface ChainEnd {
  readonly velocity: number;
  /** Release position (the final sample's position). */
  readonly position: number;
}

export interface ChainSessionOptions {
  readonly threshold?: number;
  readonly windowMs?: number;
  /** Custom tracker (tests); defaults to a fresh LSQ2 tracker. */
  readonly tracker?: VelocityTracker;
}

export interface ChainSession {
  begin(position: number, time: number): void;
  move(input: ChainMoveInput): ChainMove;
  /** The parent accepted the offer — ownership locks for the session. */
  accept(direction: HandOverDirection, position: number): void;
  /** The parent declined; reset the drift baseline. */
  rearm(position: number): void;
  /**
   * Gesture end. Pushes the final release sample when a position is
   * given (a pause before release then yields ~0 velocity instead of a
   * stale pre-pause reading) and reports the trailing LSQ2 velocity when
   * the parent owned the session. Resets the session.
   */
  end(time: number, position?: number): ChainEnd | undefined;
  readonly taken: boolean;
  /** The locked hand-over direction, undefined while unowned. */
  readonly direction: HandOverDirection | undefined;
}

export function createChainSession(
  options: ChainSessionOptions = {},
): ChainSession {
  const tracker = options.tracker ?? createVelocityTracker(options);
  let last = 0;
  let take = 0;
  let direction: HandOverDirection = "down";
  let owned = false;
  let begun = false;
  /** Cumulative unconsumed displacement since the last consumption,
   * offer, or begin: slow drags cross the threshold eventually. */
  let drift = 0;
  /** Last seen position — the end() fallback when no release sample is
   * given (the tracker owns velocity; nothing else needs the history). */
  let lastPosition = 0;

  return {
    begin(position, time) {
      last = position;
      take = position;
      direction = "down";
      owned = false;
      begun = true;
      drift = 0;
      lastPosition = position;
      tracker.add(time, position);
    },
    move(input) {
      if (!begun) return { kind: "child", consumed: zeroConsumed() };
      lastPosition = input.position;
      tracker.add(input.time, input.position);
      if (owned) {
        const raw = input.position - take;
        return {
          kind: "track",
          direction,
          delta:
            direction === "down" ? Math.max(0, raw) : Math.min(0, raw),
        };
      }
      const rawStep = input.position - last;
      last = input.position;
      const threshold = input.threshold ?? options.threshold ?? HAND_OVER_THRESHOLD;

      // Pre phase: the parent eats first, clamped to what this move has.
      let step = rawStep;
      let pre = 0;
      if (input.preConsume !== undefined && rawStep !== 0) {
        const wanted = input.preConsume(rawStep);
        pre =
          wanted * rawStep > 0
            ? Math.min(Math.abs(wanted), Math.abs(rawStep)) * Math.sign(rawStep)
            : 0;
        step = rawStep - pre;
      }

      let offered: HandOverDirection | undefined;
      if (input.locked) {
        if (step < 0) {
          // Upward is never the child's to consume in locked mode: the
          // drift accumulator gates when the parent gets the offer.
          drift += step;
          if (drift < -threshold) offered = "up";
        } else if (input.atStartBound) {
          // At the bound nothing can consume: accumulate until the
          // threshold offers the parent.
          drift += step;
          if (drift > threshold) offered = "down";
        } else {
          // Off the bound, scrolling back toward it IS the child's job —
          // every downward step is consumed immediately, no threshold.
          drift = 0;
          const reached = input.consumeToStart?.(step) ?? false;
          return {
            kind: "scroll-back",
            step,
            reached,
            consumed: { pre, child: step, remainder: 0 },
          };
        }
      } else {
        // Unlocked: the browser owns native consumption of downward moves
        // away from the bound — drift persists so the boundary crossing
        // in the SAME gesture offers immediately (the atStartBound gate
        // keeps mid-list downward pulls from offering early). The decision
        // itself is the public helper, fed the accumulated drift.
        drift += step;
        offered = handOverDecision({
          delta: drift,
          atStartBound: input.atStartBound,
          threshold,
        });
      }

      if (offered === undefined) {
        return {
          kind: "child",
          consumed: { pre, child: step, remainder: 0 },
        };
      }
      return { kind: "offer", direction: offered };
    },
    accept(accepted, position) {
      if (!begun || owned) return;
      owned = true;
      direction = accepted;
      take = position;
    },
    rearm(position) {
      if (owned) return;
      last = position;
      drift = 0;
    },
    end(time, position) {
      if (!begun) return undefined;
      const wasOwned = owned;
      if (position !== undefined) {
        tracker.add(time, position);
        lastPosition = position;
      }
      const result: ChainEnd | undefined = wasOwned
        ? {
            velocity: tracker.velocityAt(time),
            position: position ?? lastPosition,
          }
        : undefined;
      begun = false;
      owned = false;
      drift = 0;
      return result;
    },
    get taken() {
      return owned;
    },
    get direction() {
      return owned ? direction : undefined;
    },
  };
}

function zeroConsumed(): ConsumedBreakdown {
  return { pre: 0, child: 0, remainder: 0 };
}
