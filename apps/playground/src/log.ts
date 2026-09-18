/**
 * Debug logging for the demo: enabled with ?debug in the URL, silent
 * otherwise. When enabled, the gesture-web package's internal logging is
 * routed through the same sink — loaded lazily so plain-Node test runs
 * (which can't evaluate HTMLElement subclasses) never touch it.
 */
const enabled =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("debug");

export function log(scope: string, ...detail: unknown[]): void {
  if (!enabled) return;
  console.log(`%c[${scope}]`, "color:#8a7f6a;font-weight:bold", ...detail);
}

if (enabled) {
  void import("@fluvient-loom/gesture-web").then(({ setLogSink }) => {
    setLogSink(log);
  });
}
