import {
  createVelocityTracker,
  dragPercent,
  projectSettlement,
  type SnapPoint,
  type VelocityTracker,
} from "@fluvient-loom/nested-gesture";
import { gestureLog } from "./sink.ts";

export type SheetState = "closed" | "half" | "full";

export const SHEET_POSITION: Record<SheetState, number> = {
  full: 0,
  half: 50,
  closed: 100,
};

/** Scrim opacity for a sheet position (dark at half/full, gone at closed). */
function scrimOpacity(percent: number): number {
  return Math.min(1, Math.max(0, (100 - percent) / 50));
}

/**
 * <bottom-sheet> — a half/full/closed sheet owning all of its gesture
 * experience: grabber drag, in-sheet quick left-swipe (translated into
 * the sheet's vertical dismissal vocabulary), scroll-chain hand-over
 * from any <scroll-view> living in its slot (plain content simply gets
 * no chain), scrim, rounded/full styling, and the layer-scoped View
 * Transition rules. The host drives lifecycle — openTo()/close() — and
 * receives a `dismiss` event whenever a gesture decides to close; the
 * host turns that into whatever "back" means for it.
 */
export class BottomSheet extends HTMLElement {
  #root: HTMLElement | undefined;
  #scrim: HTMLElement | undefined;
  #state: SheetState = "closed";
  #tracker: VelocityTracker = createVelocityTracker();
  #hideTimer: ReturnType<typeof setTimeout> | undefined;

  connectedCallback(): void {
    if (this.#root !== undefined) return;
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        /* Popover (manual) owns stacking via the top layer — no z-index
           anywhere. Position overrides the popover UA centering. */
        position: fixed;
        inset: auto;
        left: 0;
        right: 0;
        bottom: 0;
        height: 100dvh;
        display: flex;
        flex-direction: column;
        transform: translateY(100%);
        background: #faf8f4;
        border: none;
        padding: 0;
        border-radius: 16px 16px 0 0;
        box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }
      :host([hidden]) { display: none; }
      @media (prefers-color-scheme: dark) {
        :host { background: #1c1f26; }
      }
      .grabber {
        padding: 10px 0 6px;
        display: grid;
        place-items: center;
        touch-action: none;
        cursor: grab;
      }
      .grabber span {
        width: 40px;
        height: 4px;
        border-radius: 999px;
        background: rgba(127, 117, 96, 0.45);
        transition: transform 120ms, opacity 120ms;
      }
      /* Full screen is a proper page: no handle. Dismissal still has the
         scroll chain (pull down at the list top), the quick swipe, and
         the back path. */
      :host([data-state="full"]) .grabber { display: none; }
      .head ::slotted(h1) { font-size: 18px; margin: 2px 16px 0; }
      .content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
      slot { flex: 1; min-height: 0; }
    `;
    // The scrim is a manual popover mounted under <body> (not in this
    // element's shadow): top-layer stacking in show order puts it beneath
    // the sheet, position:fixed has no transformed ancestor there, and
    // body-mounted popovers work across engines where shadow-internal
    // popovers are flaky. Styles inline — it lives outside the shadow.
    const scrim = document.createElement("div");
    scrim.setAttribute("popover", "manual");
    scrim.style.cssText = `
      position: fixed;
      inset: 0;
      /* Popover UA styles set width/height: fit-content — an empty div
         collapses to 0×0 and the scrim vanishes. Explicit full size. */
      width: 100%;
      height: 100%;
      border: none;
      padding: 0;
      background: rgba(0, 0, 0, 0.35);
      opacity: 0;
      transition: opacity 300ms;
      touch-action: none;
      margin: 0;
    `;
    scrim.hidden = true;
    document.body.appendChild(scrim);
    const grabber = document.createElement("div");
    grabber.className = "grabber";
    grabber.setAttribute("role", "button");
    grabber.setAttribute("aria-label", "拖动浮层");
    const content = document.createElement("div");
    content.className = "content";
    content.appendChild(document.createElement("slot"));
    shadow.append(style, grabber, content);
    this.setAttribute("popover", "manual");
    this.#root = this;
    this.#scrim = scrim;

    scrim.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("dismiss", { bubbles: true, composed: true }),
      );
    });
    this.#bindSurfaceDrag();
    this.#bindChains();
    this.hidden = true;
    this.setAttribute("data-sheet", "list");
  }

  get state(): SheetState {
    return this.#state;
  }

  openTo(state: Exclude<SheetState, "closed">, animate = true): void {
    this.#apply(state, animate);
  }

  close(animate = true): void {
    this.#apply("closed", animate);
  }

  #apply(state: SheetState, animate: boolean): void {
    if (state === this.#state && state === "closed") {
      // Re-closing a closed sheet must be a true no-op: re-running the
      // close branch would re-arm scene classes and timers that leak into
      // unrelated View Transitions.
      return;
    }
    this.#state = state;
    gestureLog("sheet", `→ ${state}`, { animate });
    this.setAttribute("data-state", state);
    if (state === "full") {
      this.style.borderRadius = "0";
      this.style.boxShadow = "none";
    } else {
      this.style.borderRadius = "";
      this.style.boxShadow = "";
    }
    if (animate) {
      // A projection-paired animation: the duration tracks the travel so a
      // distant landing doesn't crawl (clamped for feel).
      const travel = Math.abs(SHEET_POSITION[state] - this.#percent());
      const duration = Math.min(420, Math.max(180, travel * 4.2));
      this.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 0, 1), border-radius ${duration}ms cubic-bezier(0.2, 0, 0, 1)`;
    } else {
      this.style.transition = "none";
    }
    this.style.transform = `translateY(${SHEET_POSITION[state]}%)`;
    const scrim = this.#scrim!;
    if (state === "closed") {
      scrim.style.opacity = "0";
      if (this.#hideTimer !== undefined) clearTimeout(this.#hideTimer);
      this.#hideTimer = setTimeout(() => {
        if (this.#state !== "closed") return;
        this.hidePopover();
        this.hidden = true;
        scrim.hidePopover();
        scrim.hidden = true;
        document.documentElement.classList.remove("sheet-open");
      }, 320);
    } else {
      document.documentElement.classList.add("sheet-open");
      this.hidden = false;
      scrim.hidden = false;
      // Re-showing an already-shown popover makes some engines bounce it
      // out of and back into the top layer — that is the flicker. Only
      // show when not already open.
      if (!scrim.matches(":popover-open")) scrim.showPopover();
      if (!this.matches(":popover-open")) this.showPopover();
      scrim.style.opacity = "1";
    }
    this.dispatchEvent(
      new CustomEvent("statechange", {
        bubbles: true,
        composed: true,
        detail: { state },
      }),
    );
    // Consumption priority: while half, vertical pans inside the sheet's
    // scroll views belong to the sheet (expand first); while full, the
    // list scrolls natively. StickyListView subclasses ScrollView, so the
    // tag selector covers both.
    for (const view of this.querySelectorAll<HTMLElement>(
      "scroll-view, sticky-list-view",
    )) {
      (
        view as unknown as {
          setVerticalLock(locked: boolean): void;
        }
      ).setVerticalLock(state === "half");
    }
  }

  #percent(): number {
    const match = /translateY\(([\d.]+)%\)/.exec(this.style.transform);
    return match === null ? SHEET_POSITION.closed : Number(match[1]);
  }

  #reflect(percent: number): void {
    this.style.transform = `translateY(${percent}%)`;
    if (this.#scrim !== undefined) {
      this.#scrim.style.opacity = String(scrimOpacity(percent));
    }
  }

  #clearReflection(): void {
    if (this.#scrim !== undefined) this.#scrim.style.opacity = "";
  }

  // Physics settlement: the release velocity is a distance signal. The
  // horizon is risk-priced — close is destructive (the sheet dies), so a
  // flick must carry further toward it than toward full to land there.
  static readonly SNAPS: readonly SnapPoint<SheetState | "close">[] = [
    { at: SHEET_POSITION.full, target: "full" },
    { at: SHEET_POSITION.half, target: "half" },
    { at: SHEET_POSITION.closed, target: "close" },
  ];
  static readonly PROJECTION_MS = 220;
  static readonly CLOSE_PROJECTION_MS = 120;

  #settleOrDismiss(velocity: number): void {
    this.#clearReflection();
    const projected = projectSettlement({
      positionPercent: this.#percent(),
      velocityPxPerMs: velocity,
      viewportPx: window.innerHeight,
      snaps: BottomSheet.SNAPS,
      projectionMs: BottomSheet.PROJECTION_MS,
      snapHorizon: (snap) =>
        snap.target === "close"
          ? BottomSheet.CLOSE_PROJECTION_MS
          : BottomSheet.PROJECTION_MS,
    });
    gestureLog("sheet", "settle", {
      percent: Math.round(this.#percent()),
      velocity: velocity.toFixed(2),
      projected: Math.round(projected.projectedPercent),
      target: projected.target,
      remaining: projected.remainingVelocityPxPerMs.toFixed(2),
    });
    if (projected.target === "close") {
      if (this.#state === "full") {
        // House rule: full never collapses straight to closed — the sheet
        // must pass through half first, whatever the gesture wanted.
        this.#apply("half", true);
        return;
      }
      this.dispatchEvent(
        new CustomEvent("dismiss", { bubbles: true, composed: true }),
      );
      return;
    }
    this.#apply(projected.target, true);
  }

  #bindSurfaceDrag(): void {
    let drag:
      | { startY: number; basePercent: number; from: SheetState }
      | undefined;
    this.addEventListener("pointerdown", (event) => {
      if (this.#state === "closed") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target === null) return;
      // Scrolling areas own their gestures (chain hand-over); interactive
      // elements own their taps. The rest of the sheet surface drags.
      if (target.closest?.("scroll-view")) return;
      if (target.closest?.("button, a, [data-action]")) return;
      drag = {
        startY: event.clientY,
        basePercent: this.#percent(),
        from: this.#state,
      };
      this.setPointerCapture(event.pointerId);
      this.#tracker = createVelocityTracker();
      this.#tracker.add(event.timeStamp, event.clientY);
      // The moment a drag begins, corners come back; transform tracks raw.
      this.style.transition = "border-radius 200ms";
      this.style.borderRadius = "";
      this.style.boxShadow = "";
    });
    this.addEventListener("pointermove", (event) => {
      if (drag === undefined) return;
      this.#tracker.add(event.timeStamp, event.clientY);
      const percent = dragPercent(
        drag.basePercent,
        event.clientY - drag.startY,
        window.innerHeight,
      );
      this.#reflect(percent);
    });
    const settle = (event: PointerEvent) => {
      if (drag === undefined) return;
      const basePercent = drag.basePercent;
      drag = undefined;
      this.#tracker.add(event.timeStamp, event.clientY);
      const velocity = this.#tracker.velocityAt(event.timeStamp);
      const travel = Math.abs(this.#percent() - basePercent);
      if (travel < 1 && Math.abs(velocity) < 1) return; // a tap: no settle
      this.#settleOrDismiss(velocity);
    };
    this.addEventListener("pointerup", settle);
    this.addEventListener("pointercancel", settle);
  }

  #bindChains(): void {
    this.addEventListener("boundarydrag", ((event: CustomEvent) => {
      const detail = event.detail as { direction: string; delta: number };
      if (this.#state === "closed") return;
      event.preventDefault();
      if (!this.#chained) {
        gestureLog("sheet", "chain hand-over accepted", { direction: detail.direction });
        this.#chained = { basePercent: this.#percent() };
        this.style.transition = "none";
      }
      const percent = dragPercent(
        this.#chained.basePercent,
        detail.delta,
        window.innerHeight,
      );
      this.#reflect(percent);
    }) as EventListener);
    this.addEventListener("boundaryrelease", ((event: CustomEvent) => {
      const detail = event.detail as { velocity: number };
      if (!this.#chained) return;
      this.#chained = undefined;
      // The child's LSQ2 tracker fits the whole gesture, but the velocity
      // is already sheet-owned semantics: the hand-over recorded the take
      // point, and the tracker window covers only the trailing 100ms of
      // owned motion (pre-hand-over finger speed decayed out of it).
      this.#settleOrDismiss(detail.velocity);
    }) as EventListener);
  }

  #chained: { basePercent: number } | undefined;
}
