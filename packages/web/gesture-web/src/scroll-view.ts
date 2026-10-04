import {
  createChainSession,
  type ChainSession,
} from "@fluvient-loom/nested-gesture";
import { gestureLog } from "./sink.ts";

/**
 * <scroll-view> — the NestedGesture child role on the Web.
 *
 * A drag scrolls the content natively. When the content reaches its
 * boundary and the finger keeps going, the component offers the gesture
 * upward via a cancelable `boundarydrag` event: a consumer that wants the
 * gesture calls preventDefault() (from that moment the component stops
 * native scrolling, keeps preventing default, and keeps dispatching
 * `boundarydrag` with the cumulative delta). On release it dispatches
 * `boundaryrelease` with the trailing velocity. Consumers that never
 * listen simply get an ordinary scroller.
 *
 * Built on touch events: under `touch-action: pan-y` the browser seizes
 * the vertical pan and fires pointercancel, so pointer events cannot
 * observe the hand-over.
 */
export class ScrollView extends HTMLElement {
  #body: HTMLElement | undefined;
  #locked = false;
  #topBound: () => number = () => 0;
  #session: ChainSession | undefined;

  /**
   * Effective top bound for downward hand-over (NestedGesture §有效边界).
   * Defaults to the content top (scrollTop 0) — with CSS position:sticky
   * headers are content, so 0 stays correct. The seam exists for
   * implementations that keep pinned chrome inside the scroller.
   */
  setTopBoundProvider(provider: () => number): void {
    this.#topBound = provider;
  }

  /**
   * Pre phase: a parent may consume each move's displacement BEFORE the
   * child scrolls (collapsing headers, pull-to-refresh). The callback
   * receives the signed step and returns what it took.
   */
  setPreConsumer(consumer: ((step: number) => number) | undefined): void {
    this.#preConsume = consumer;
  }
  #preConsume: ((step: number) => number) | undefined;

  /**
   * Vertical lock: when locked, the container never hands vertical pans to
   * the browser (touch-action: none) and the gesture is offered to a
   * consumer immediately — that is how "parent expands first" avoids
   * racing an already-activated native scroll. Downward drags scroll the
   * list manually back to its top before offering the dismissal. A sheet
   * toggles this per state (half = locked, full = native).
   */
  setVerticalLock(locked: boolean): void {
    this.#locked = locked;
    if (this.#body !== undefined) {
      this.#body.style.touchAction = locked ? "none" : "";
    }
  }

  connectedCallback(): void {
    if (this.#body !== undefined) return;
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { display: block; flex: 1; min-height: 0; }
      .body {
        height: 100%;
        overflow-y: auto;
        /* none, not contain: contain still allows the container's own
           rubber-band, which double-moves with a consumer's takeover. */
        overscroll-behavior: none;
        /* Vertical panning stays native; horizontal moves are handed to
           JS so in-sheet horizontal gestures stay available. */
        touch-action: pan-y;
      }
    `;
    const body = document.createElement("div");
    body.className = "body";
    const slot = document.createElement("slot");
    body.appendChild(slot);
    root.append(style, body);
    this.#body = body;

    body.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) {
          this.#session = undefined;
          return;
        }
        const touch = event.touches[0]!;
        this.#session = createChainSession();
        this.#session.begin(touch.clientY, event.timeStamp);
      },
      { passive: true },
    );

    body.addEventListener(
      "touchmove",
      (event) => {
        const session = this.#session;
        if (session === undefined || event.touches.length !== 1) return;
        const touch = event.touches[0]!;
        const move = session.move({
          position: touch.clientY,
          time: event.timeStamp,
          locked: this.#locked,
          preConsume: this.#preConsume,
          atStartBound: body.scrollTop <= this.#topBound(),
          consumeToStart: (step) => {
            const bound = this.#topBound();
            body.scrollTop = Math.max(bound, body.scrollTop - step);
            return body.scrollTop <= bound;
          },
        });
        switch (move.kind) {
          case "child":
          case "scroll-back":
            return;
          case "offer": {
            const offered = new CustomEvent("boundarydrag", {
              bubbles: true,
              composed: true,
              cancelable: true,
              detail: { direction: move.direction, delta: 0 },
            });
            if (!this.dispatchEvent(offered)) {
              gestureLog(
                "scroll-view",
                `hand-over offered (${move.direction}) → accepted`,
              );
              session.accept(move.direction, touch.clientY);
            } else {
              session.rearm(touch.clientY);
            }
            return;
          }
          case "track": {
            // Mid-gesture hand-over from a native scroll: the browser may
            // already own the pan (cancelable=false) — nothing left to
            // prevent then; the list sits at its boundary anyway.
            if (event.cancelable) event.preventDefault();
            this.dispatchEvent(
              new CustomEvent("boundarydrag", {
                bubbles: true,
                composed: true,
                detail: { direction: move.direction, delta: move.delta },
              }),
            );
            return;
          }
        }
      },
      { passive: false },
    );

    const settle = (event: TouchEvent) => {
      const session = this.#session;
      if (session === undefined) return;
      this.#session = undefined;
      const release = session.end(
        event.timeStamp,
        event.changedTouches[0]?.clientY,
      );
      if (release === undefined) return;
      this.dispatchEvent(
        new CustomEvent("boundaryrelease", {
          bubbles: true,
          composed: true,
          detail: { velocity: release.velocity },
        }),
      );
    };
    body.addEventListener("touchend", settle);
    body.addEventListener("touchcancel", settle);
  }
}
