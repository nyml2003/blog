import type { LogSource, ServiceRole } from './ports.ts';

export const SERVICE_BINARIES: Readonly<Record<Exclude<ServiceRole, 'web'>, string>> = {
  product: 'product',
  data: 'data',
  mock: 'mock',
};

const LOG_SOURCE_PATTERN = /^\[(web|product|data|mock|ops)\] /;

export function withLogPrefix(role: LogSource, message: string): string {
  return LOG_SOURCE_PATTERN.test(message) ? message : `[${role}] ${message}`;
}
