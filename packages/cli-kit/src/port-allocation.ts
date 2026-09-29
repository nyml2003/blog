import { OpsError, type ErrorDetail } from './errors.ts';
import type { PortProbe, ServiceRole } from './ports.ts';
export type { PortProbe } from './ports.ts';

/** Port overrides are 1024–65535; `0` (ephemeral) and non-integers are usage errors. */
export const PORT_MIN = 1024;
export const PORT_MAX = 65535;
/** Bounded increment: at most 10 candidates, +0 … +9, per service per run. */
export const PORT_ATTEMPTS = 10;

export interface PortAllocation { service: ServiceRole; port: number; attempts: readonly number[] }

/** Candidate window for one service, clamped to the selectable range. */
export function candidatesFor(candidate: number, count = PORT_ATTEMPTS): number[] {
  const ports: number[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const port = candidate + offset;
    if (port > PORT_MAX) break;
    ports.push(port);
  }
  return ports;
}

/**
 * Bind-probe the candidate window in order, skipping ports already handed out in this run so
 * two services of the same mode can never target the same port.
 */
export async function allocatePort(params: {
  service: ServiceRole;
  candidate: number;
  probe: PortProbe;
  excluded?: ReadonlySet<number>;
}): Promise<PortAllocation> {
  const excluded = params.excluded ?? new Set<number>();
  const attempts: number[] = [];
  for (const port of candidatesFor(params.candidate)) {
    if (excluded.has(port)) continue;
    attempts.push(port);
    if (await params.probe.isFree(port)) return { service: params.service, port, attempts };
  }
  throw new OpsError('PORT_EXHAUSTED', `端口耗尽: ${params.service} 在 ${attempts.join(', ')} 上均无法绑定`, portDetails(params.service, attempts));
}

function portDetails(service: ServiceRole, attempts: readonly number[]): ErrorDetail[] {
  return attempts.map((port) => ({ service, port }));
}
