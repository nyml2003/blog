/** Stable machine-readable error codes observable through `--json` . */
export type OpsErrorCode = 'USAGE' | 'PORT_EXHAUSTED' | 'SERVICE_START_FAILED' | 'BUILD_FAILED' | 'CHILD_EXITED';

export const EXIT_OK = 0;
export const EXIT_USAGE = 10;
export const EXIT_FAILURE = 20;

export interface ErrorDetail { service?: string; port?: number; command?: string; [key: string]: unknown }

export interface OpsErrorPayload {
  ok: false;
  command: string;
  exitCode: number;
  error: { code: OpsErrorCode; message: string; details: readonly ErrorDetail[] };
}

export class OpsError extends Error {
  readonly code: OpsErrorCode;
  readonly exitCode: number;
  readonly details: readonly ErrorDetail[];

  constructor(code: OpsErrorCode, message: string, details: readonly ErrorDetail[] = [], exitCode = EXIT_FAILURE) {
    super(message);
    this.name = 'OpsError';
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

export interface ServiceAddress { service: string; host: string; port: number; url: string }

export interface ServicesPayload {
  ok: true;
  command: string;
  services: readonly ServiceAddress[];
  entry: string | null;
}

export const LISTEN_HOST = '127.0.0.1';

export function serviceAddress(service: string, port: number): ServiceAddress {
  return { service, host: LISTEN_HOST, port, url: `http://${LISTEN_HOST}:${port}` };
}

export function errorPayload(command: string, error: unknown, exitCode = EXIT_FAILURE): OpsErrorPayload {
  if (error instanceof OpsError) {
    return { ok: false, command, exitCode: error.exitCode, error: { code: error.code, message: error.message, details: error.details } };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, command, exitCode, error: { code: 'BUILD_FAILED', message, details: [] } };
}

export function servicesPayload(command: string, services: readonly ServiceAddress[], entry: string | null): ServicesPayload {
  return { ok: true, command, services, entry };
}
