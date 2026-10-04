import assert from "node:assert/strict";
import test from "node:test";
import {
  createChainSession,
  createFling,
  createVelocityTracker,
  dragPercent,
  flingWithSlop,
  handOverDecision,
  projectSettlement,
  sampleVelocity,
  snapOnRelease,
} from "@fluvient-loom/nested-gesture";

/* ---------------------------------------------------------------- *
 * Velocity: LSQ2 tracker
 * ---------------------------------------------------------------- */

test("tracker: recovers the slope of a clean ramp", () => {
  const tracker = createVelocityTracker();
  // 0.5 px/ms ramp sampled every 20ms over 100ms.
  for (let t = 0; t <= 100; t += 20) tracker.add(t, t * 0.5);
  assert.ok(Math.abs(tracker.velocityAt(100) - 0.5) < 0.01);
});

test("tracker: LSQ2 shrugs off a jitter spike better than a jitter-anchored chord", () => {
  const tracker = createVelocityTracker();
  const samples = [
    { time: 0, position: 0 },
    { time: 30, position: 30 },
    { time: 60, position: 60 },
    { time: 90, position: 120 }, // jitter: upward spike off a 1px/ms trend
    { time: 100, position: 100 },
  ];
  for (const s of samples) tracker.add(s.time, s.position);
  const lsq = tracker.velocityAt(100);
  // A chord anchored ON the spike flips sign (−2 px/ms); the quadratic
  // fit over the whole window stays near the trend (≈1).
  const chordFromJitter = sampleVelocity(
    samples.filter((s) => s.time >= 90),
    100,
  );
  assert.ok(chordFromJitter < 0, "spike-anchored chord should be negative");
  assert.ok(lsq > 0.7 && lsq < 1.5, `LSQ2 should stay near the trend, got ${lsq}`);
});

test("tracker: degrades to chord with two samples, zero below that", () => {
  const two = createVelocityTracker();
  two.add(0, 0);
  two.add(50, 100);
  assert.ok(Math.abs(two.velocityAt(50) - 2) < 0.001);
  const one = createVelocityTracker();
  one.add(0, 0);
  assert.equal(one.velocityAt(0), 0);
});

test("tracker: units scale Android-style (1000 → px/s)", () => {
  const tracker = createVelocityTracker();
  for (let t = 0; t <= 100; t += 20) tracker.add(t, t * 0.5);
  assert.ok(Math.abs(tracker.velocityAt(100, 1000) - 500) < 10);
});

test("tracker: samples outside the window stop counting", () => {
  const tracker = createVelocityTracker();
  tracker.add(0, 0);
  tracker.add(10, 100); // ancient burst
  assert.equal(tracker.velocityAt(1000), 0);
});

/* ---------------------------------------------------------------- *
 * Physics settlement
 * ---------------------------------------------------------------- */

const SNAPS = [
  { at: 0, target: "full" },
  { at: 50, target: "half" },
  { at: 100, target: "close" },
] as const;
const settle = (position: number, velocity: number, extra = {}) =>
  projectSettlement({
    positionPercent: position,
    velocityPxPerMs: velocity,
    viewportPx: 800,
    snaps: SNAPS,
    projectionMs: 220,
    ...extra,
  });

test("settle feel-map: mid-band micro-fling stays at half", () => {
  // 50% + 0.2 px/ms × 220 ms = 5.5% travel → 55.5% → half.
  assert.equal(settle(50, 0.2).target, "half");
  assert.equal(settle(50, 0).target, "half");
});

test("settle feel-map: travel below the midpoint stays, above crosses", () => {
  // Nearest-snap is a midpoint rule: full↔half boundary sits at 25%.
  // −0.8 px/ms × 27.5 = −22% → 28% (below midpoint) → half;
  // −1.2 × 27.5 = −33% → 17% (past midpoint) → full.
  assert.equal(settle(50, -0.8).target, "half");
  assert.equal(settle(50, -1.2).target, "full");
});

test("settle feel-map: reverse-direction fling reaches full", () => {
  // 40% − 0.6 × 27.5 = −16.5% → 23.5% (past midpoint) → full.
  assert.equal(settle(40, -0.6).target, "full");
});

test("settle feel-map: boundary releases clamp at the ends", () => {
  // Near-full + strong downward: projected 43% lands near half (the
  // projection travels, it does not teleport past the nearest snap).
  assert.equal(settle(2, 1.5).target, "half");
  // Near-full + strong upward: clamped at 0 → full.
  assert.equal(settle(2, -1.5).target, "full");
  // Near-close + strong downward: clamped at 100 → close.
  assert.equal(settle(98, 1.5).target, "close");
});

test("settle feel-map: pause-before-release velocity is ~0 → position decides", () => {
  assert.equal(settle(60, 0.01).target, "half");
});

test("settle: risk pricing protects a far destructive target", () => {
  // From 30% with 3 px/ms the default horizon carries 82.5% → into
  // close's region → symmetric lands close. Under close's own 120ms
  // horizon the carry is only 45% — short of the 70% needed — so the
  // projection retreats to close's near region boundary (75, the
  // half/close midpoint) and lands half. THIS is the case the old
  // next-snap-only model missed: the destructive snap hides behind half.
  const cautious = settle(30, 3, {
    snapHorizon: (snap: (typeof SNAPS)[number]) =>
      snap.target === "close" ? 120 : 220,
  });
  const symmetric = settle(30, 3);
  assert.equal(symmetric.target, "close");
  assert.equal(cautious.target, "half");
  assert.equal(cautious.projectedPercent, 75);
});

test("settle: released inside a protected region, proximity rules", () => {
  // 85% is already inside close's nearest region — risk pricing cannot
  // move the landing backward; both configurations land close.
  const cautious = settle(85, 0.6, {
    snapHorizon: (snap: (typeof SNAPS)[number]) =>
      snap.target === "close" ? 120 : 220,
  });
  assert.equal(cautious.target, "close");
  assert.equal(cautious.projectedPercent, 100);
});

test("settle: overshoot clamps and reports the physical edge velocity", () => {
  // 95% + 2 px/ms × 220/800×100 = +55% → 150% → clamp 100. The edge is
  // 5% = 40px away; under τ=160 decay the velocity at the crossing is
  // v0·(1−d/(v0·τ)) = 2·(1−40/320) = 1.75 px/ms (exact, not a heuristic
  // leftover/horizon ratio).
  const result = settle(95, 2);
  assert.equal(result.target, "close");
  assert.equal(result.projectedPercent, 100);
  assert.ok(Math.abs(result.remainingVelocityPxPerMs - 1.75) < 0.01);
});

test("settle: projectionMs = 0 is the rollback switch (pure nearest position)", () => {
  assert.equal(settle(50, -3, { projectionMs: 0 }).target, "half");
  assert.equal(settle(20, 3, { projectionMs: 0 }).target, "full");
});

test("settle: snap distance uses real percents, not indices", () => {
  const uneven = [
    { at: 0, target: "full" },
    { at: 40, target: "half" },
    { at: 80, target: "close" },
  ];
  const result = projectSettlement({
    positionPercent: 55,
    velocityPxPerMs: 0,
    viewportPx: 800,
    snaps: uneven,
    projectionMs: 220,
  });
  assert.equal(result.target, "half");
});

test("settle: noise floor absorbs sub-threshold jitter", () => {
  assert.equal(settle(50, 0.04).target, "half");
  assert.equal(settle(50, -0.04).target, "half");
});

/* ---------------------------------------------------------------- *
 * Fling channel
 * ---------------------------------------------------------------- */

test("fling: exponential decay math", () => {
  const fling = createFling({ velocityPxPerMs: 1, decayTauMs: 100 });
  assert.ok(Math.abs(fling.velocityAt(0) - 1) < 1e-9);
  assert.ok(Math.abs(fling.velocityAt(100) - 1 / Math.E) < 1e-6);
  assert.ok(Math.abs(fling.positionAt(100) - 100 * (1 - 1 / Math.E)) < 1e-6);
  assert.ok(Math.abs(fling.distance() - 100) < 1e-6);
});

test("fling: settle duration and interruption remaining", () => {
  const fling = createFling({
    velocityPxPerMs: 1,
    decayTauMs: 100,
    floorPxPerMs: 0.01,
  });
  assert.ok(Math.abs(fling.settleDuration() - 100 * Math.log(100)) < 0.1);
  const cut = fling.remaining(50);
  assert.ok(cut.velocityPxPerMs > 0.6 && cut.velocityPxPerMs < 0.61);
  // The relay carries the position too: x(50) = 100·(1−e^−0.5) ≈ 39.3.
  assert.ok(cut.positionPx > 39 && cut.positionPx < 40);
});

test("fling: a start below the floor settles immediately, not negatively", () => {
  const weak = createFling({
    velocityPxPerMs: 0.005,
    decayTauMs: 100,
    floorPxPerMs: 0.01,
  });
  assert.equal(weak.settleDuration(), 0);
  assert.equal(weak.remaining(0).velocityPxPerMs, 0);
});

/* ---------------------------------------------------------------- *
 * Session: three phases + consumed writeback + cumulative slop
 * ---------------------------------------------------------------- */

test("handOverDecision: downward waits for the start bound, upward offers", () => {
  assert.equal(handOverDecision({ delta: 12, atStartBound: true }), "down");
  assert.equal(handOverDecision({ delta: 12, atStartBound: false }), undefined);
  assert.equal(handOverDecision({ delta: -12, atStartBound: false }), "up");
});

test("session: pre phase consumes first and the breakdown reports it", () => {
  let preTaken: number[] = [];
  const session = createChainSession();
  session.begin(100, 0);
  const offered = session.move({
    position: 112,
    time: 16,
    locked: true,
    atStartBound: true,
    preConsume: (step) => {
      preTaken.push(step);
      return step / 2;
    },
  });
  // Parent ate 6 of 12; the remaining 6 accumulates as drift (>4) → offer.
  assert.deepEqual(preTaken, [12]);
  assert.deepEqual(offered, { kind: "offer", direction: "down" });

  // A smaller move: parent eats half, remainder stays with the child.
  const session2 = createChainSession();
  session2.begin(100, 0);
  const child = session2.move({
    position: 103,
    time: 16,
    locked: true,
    atStartBound: true,
    preConsume: (step) => step / 2,
  });
  assert.equal(child.kind, "child");
  assert.deepEqual(child.consumed, { pre: 1.5, child: 1.5, remainder: 0 });
});

test("session: consumed writeback on scroll-back", () => {
  const session = createChainSession();
  session.begin(300, 0);
  let scrollTop = 40;
  const move = session.move({
    position: 312,
    time: 16,
    locked: true,
    atStartBound: scrollTop <= 0,
    consumeToStart: (step) => {
      scrollTop = Math.max(0, scrollTop - step);
      return scrollTop <= 0;
    },
  });
  assert.equal(move.kind, "scroll-back");
  assert.deepEqual(
    (move as { consumed: unknown }).consumed,
    { pre: 0, child: 12, remainder: 0 },
  );
});

test("session (unlocked): slow drags accumulate — brisk upward offers mid-list", () => {
  const session = createChainSession();
  session.begin(100, 0);
  assert.equal(
    session.move({ position: 103, time: 16, locked: false, atStartBound: true }).kind,
    "child",
  );
  assert.equal(
    session.move({ position: 80, time: 32, locked: false, atStartBound: false }).kind,
    "offer",
    "upward always offers; cumulative drift crossed the threshold",
  );
});

test("session (locked): slow sub-threshold drags accumulate to an offer", () => {
  const session = createChainSession();
  session.begin(100, 0);
  assert.equal(
    session.move({ position: 103, time: 16, locked: true, atStartBound: true }).kind,
    "child",
  );
  assert.deepEqual(
    session.move({ position: 106, time: 32, locked: true, atStartBound: true }),
    { kind: "offer", direction: "down" },
  );
});

test("session: ownership locks with direction-clamped tracking + end resets", () => {
  const session = createChainSession();
  session.begin(200, 0);
  const offered = session.move({
    position: 180,
    time: 16,
    locked: false,
    atStartBound: false,
  });
  assert.deepEqual(offered, { kind: "offer", direction: "up" });
  session.accept("up", 180);
  assert.equal(session.taken, true);
  assert.equal(session.direction, "up");
  assert.deepEqual(
    session.move({ position: 150, time: 32, locked: false, atStartBound: false }),
    { kind: "track", direction: "up", delta: -30 },
  );
  assert.deepEqual(
    session.move({ position: 190, time: 48, locked: false, atStartBound: false }),
    { kind: "track", direction: "up", delta: 0 },
  );
  const release = session.end(64, 190);
  assert.notEqual(release, undefined);
  assert.equal(release!.position, 190);
  assert.equal(session.taken, false);
  assert.equal(session.direction, undefined);
});

test("session: a pause before release yields ~0 velocity", () => {
  const session = createChainSession();
  session.begin(100, 0);
  for (let t = 16; t <= 96; t += 16) {
    session.move({
      position: 100 - t / 16,
      time: t,
      locked: false,
      atStartBound: false,
    });
  }
  session.accept("up", 80);
  const release = session.end(600, 80);
  assert.notEqual(release, undefined);
  assert.ok(
    Math.abs(release!.velocity) < 0.05,
    `expected ~0 after the pause, got ${release!.velocity}`,
  );
});

test("session: end without acceptance reports nothing", () => {
  const session = createChainSession();
  session.begin(0, 0);
  session.move({ position: 5, time: 16, locked: false, atStartBound: false });
  assert.equal(session.end(32), undefined);
});

/* ---------------------------------------------------------------- *
 * Superseded threshold model (compat)
 * ---------------------------------------------------------------- */

test("snapOnRelease: position bands and the deliberate-fling override", () => {
  const snap = (percent: number, velocity: number) =>
    snapOnRelease({ percent, velocity, full: "full", half: "half", close: "close" });
  assert.equal(snap(10, 0), "full");
  assert.equal(snap(50, 0), "half");
  assert.equal(snap(85, 0), "close");
  assert.equal(snap(10, 1.2), "close");
  assert.equal(snap(85, -1.2), "full");
});

test("flingWithSlop: velocity only counts when the container travelled", () => {
  assert.equal(flingWithSlop(-4.85, 1), 0);
  assert.equal(flingWithSlop(-1.4, 18), -1.4);
});

test("dragPercent maps and clamps", () => {
  assert.equal(dragPercent(50, 100, 1000), 60);
  assert.equal(dragPercent(0, -500, 1000), 0);
  assert.equal(dragPercent(50, 5000, 1000), 100);
  assert.equal(dragPercent(50, 100, 0), 50);
});
