/**
 * Logging sink: the host injects its logger (e.g. gated by ?debug); the
 * package stays silent by default and never touches console on its own.
 */
export type GestureLogSink = (scope: string, ...detail: unknown[]) => void;

let sink: GestureLogSink | undefined;

export function setLogSink(next: GestureLogSink | undefined): void {
  sink = next;
}

export function gestureLog(scope: string, ...detail: unknown[]): void {
  sink?.(scope, ...detail);
}
