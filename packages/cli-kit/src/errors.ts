/** Stable machine-readable error codes observable through `--json` . */
export type OpsErrorCode = 'USAGE' | 'CONFIG_INVALID' | 'DEPENDENCY_MISSING' | 'PORT_EXHAUSTED' | 'SERVICE_START_FAILED' | 'BUILD_FAILED' | 'CHILD_EXITED' | 'EXTERNAL_COMMAND_FAILED' | 'CANCELLED' | 'INTERNAL_ERROR';

export const EXIT_OK = 0;
export const EXIT_USAGE = 10;
export const EXIT_FAILURE = 20;
export const ExitCode = Object.freeze({ Ok: EXIT_OK, Usage: EXIT_USAGE, Failure: EXIT_FAILURE });

export interface ErrorDetail { service?: string; port?: number; command?: string; [key: string]: unknown }

export interface OpsFailure {
  readonly code: OpsErrorCode;
  readonly message: string;
  readonly details: readonly ErrorDetail[];
  readonly exitCode: number;
  readonly cause?: OpsFailure;
}

export function errorFromUnknown(error: unknown, code: OpsErrorCode = 'INTERNAL_ERROR', exitCode = EXIT_FAILURE): OpsFailure {
  if (error instanceof OpsError) return { code: error.code, message: error.message, details: error.details, exitCode: error.exitCode };
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : `command exited with ${exitCode}`;
  return { code, message, details: [], exitCode };
}

export interface OpsErrorPayload {
  schemaVersion: 1;
  event: 'terminated';
  ok: false;
  command: string;
  exitCode: number;
  code: OpsErrorCode;
  message: string;
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
  schemaVersion: 1;
  event: 'services_ready';
  ok: true;
  command: string;
  exitCode: 0;
  code: 'SERVICES_READY';
  message: string;
  services: readonly ServiceAddress[];
  entry: string | null;
}

export const LISTEN_HOST = '127.0.0.1';

export function serviceAddress(service: string, port: number): ServiceAddress {
  return { service, host: LISTEN_HOST, port, url: `http://${LISTEN_HOST}:${port}` };
}

export function errorPayload(command: string, error: unknown, exitCode = EXIT_FAILURE): OpsErrorPayload {
  if (error instanceof OpsError) {
    return { schemaVersion: 1, event: 'terminated', ok: false, command, exitCode: error.exitCode, code: error.code, message: error.message, error: { code: error.code, message: error.message, details: error.details } };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { schemaVersion: 1, event: 'terminated', ok: false, command, exitCode, code: 'INTERNAL_ERROR', message, error: { code: 'INTERNAL_ERROR', message, details: [] } };
}

export function servicesPayload(command: string, services: readonly ServiceAddress[], entry: string | null): ServicesPayload {
  return { schemaVersion: 1, event: 'services_ready', ok: true, command, exitCode: 0, code: 'SERVICES_READY', message: 'services ready', services, entry };
}
