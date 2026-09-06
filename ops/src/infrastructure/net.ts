import { connect, createServer, type Server } from 'node:net';
import type { PortProbe, ReadinessOptions, ReadinessProbe } from '../domain/ports.ts';
import { LISTEN_HOST } from '../domain/errors.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Confirms a candidate port by actually binding it on the loopback address; only a successful bind
 * makes the port a fact for the rest of the run.
 */
export class TcpPortProbe implements PortProbe {
  isFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server: Server = createServer();
      const done = (free: boolean) => {
        server.removeAllListeners();
        server.close(() => resolve(free));
      };
      server.once('error', () => { done(false); });
      server.listen(port, LISTEN_HOST, () => { done(true); });
    });
  }
}

/** Readiness is an actual TCP connect, retried until the service accepts or the budget runs out. */
export class TcpReadiness implements ReadinessProbe {
  wait(port: number, options: ReadinessOptions = {}): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const intervalMs = options.intervalMs ?? 150;
    const isCancelled = options.isCancelled ?? (() => false);
    const deadline = Date.now() + timeoutMs;
    const attempt = (): Promise<boolean> => new Promise((resolve) => {
      const socket = connect({ port, host: LISTEN_HOST });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    return (async () => {
      for (;;) {
        if (await attempt()) return true;
        if (isCancelled() || Date.now() >= deadline) return false;
        await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
      }
    })();
  }
}
