import { ok, type Result } from '@fluvient/core';
import type {
  CommandContext as EffectRunContext,
  CommandDescription,
  OperationIdPort,
  PreparedCommand,
  ReversibleCommand,
} from '@fluvient-loom/port';
import type { ProcessPort, Reporter } from './ports.ts';
import { EXIT_OK } from './errors.ts';

/** The single failure channel of an ops effect; commands and middlewares both produce it. */
export interface EffectFailure {
  readonly message: string;
}

export function effectFailure(message: string): EffectFailure {
  return { message };
}

/** Boundary conversion for thrown values; the internals only ever handle typed `EffectFailure`. */
function toEffectFailure(cause: unknown): EffectFailure {
  return effectFailure(cause instanceof Error ? cause.message : String(cause));
}

export type EffectOutcome = Result<void, EffectFailure>;

export interface RollbackFailure {
  readonly description: CommandDescription | undefined;
  readonly error: EffectFailure | Error;
}

export interface RollbackReport {
  readonly compensated: number;
  readonly failures: readonly RollbackFailure[];
}

export interface EffectScope {
  /** Change descriptions recorded by short-circuiting middleware; per scope, empty when everything executed. */
  readonly plan: readonly CommandDescription[];
  /** `run` never compensates previously executed effects; atomic sequences call `rollback()` themselves. */
  run<Input>(command: ReversibleCommand<Input, EffectFailure>, input: Input): Promise<EffectOutcome>;
  /** Compensates every executed command in reverse order without stopping early; returns the aggregate report. */
  rollback(): Promise<RollbackReport>;
}

export interface EffectPort extends EffectScope {
  /** An isolated scope with its own plan, undo stack and sequence; use it for concurrent batches. */
  createScope(): EffectScope;
}

/**
 * One effect passing through the waterfall. `next()` runs the remaining middleware and finally the
 * prepared command; a middleware that returns without calling it short-circuits the effect.
 */
export interface EffectExecution {
  readonly operationId: string;
  readonly sequence: number;
  readonly description: CommandDescription | undefined;
  readonly prepared: PreparedCommand<EffectFailure>;
  /** Appends the description to the plan journal; dry-run/test middlewares call it before short-circuiting. */
  record(description?: CommandDescription): void;
}

export type EffectNext = () => Promise<EffectOutcome>;

export interface EffectMiddleware {
  readonly name: string;
  /** Must call `next()` at most once to delegate; returning without it short-circuits (dry-run, rejection, fake). */
  handle(execution: EffectExecution, next: EffectNext): Promise<EffectOutcome>;
}

export interface EffectDispatcherOptions {
  readonly operationIds: OperationIdPort;
  readonly middlewares: readonly EffectMiddleware[];
}

interface UndoEntry {
  readonly description: CommandDescription | undefined;
  compensate(): Promise<Result<void, EffectFailure>>;
}

function createScope(options: EffectDispatcherOptions): EffectScope {
  const plan: CommandDescription[] = [];
  const undo: UndoEntry[] = [];
  let sequence = 0;

  const execute = async (execution: EffectExecution): Promise<EffectOutcome> => {
    let executed: EffectOutcome;
    try {
      executed = await execution.prepared.execute();
    } catch (error) {
      executed = { ok: false, error: toEffectFailure(error) };
    }
    if (!executed.ok) {
      // Compensate the partially executed command; a compensation failure (returned or thrown)
      // is reported alongside the original error instead of replacing it.
      let compensated: EffectOutcome;
      try {
        compensated = await execution.prepared.compensate();
      } catch (error) {
        compensated = { ok: false, error: toEffectFailure(error) };
      }
      if (!compensated.ok) {
        return { ok: false, error: effectFailure(`${executed.error.message}；补偿失败：${compensated.error.message}`) };
      }
      return executed;
    }
    undo.push({ description: execution.description, compensate: () => execution.prepared.compensate() });
    return executed;
  };

  const chain = (execution: EffectExecution, index: number): Promise<EffectOutcome> => {
    const middleware = options.middlewares[index];
    if (middleware === undefined) return execute(execution);
    let called = false;
    const next: EffectNext = () => {
      if (called) throw new Error(`${middleware.name}: next() called more than once`);
      called = true;
      return chain(execution, index + 1);
    };
    return (async () => {
      try {
        return await middleware.handle(execution, next);
      } catch (error) {
        return { ok: false, error: toEffectFailure(error) } satisfies EffectOutcome;
      }
    })();
  };

  return {
    get plan(): readonly CommandDescription[] {
      return plan;
    },
    async run<Input>(command: ReversibleCommand<Input, EffectFailure>, input: Input): Promise<EffectOutcome> {
      sequence += 1;
      const context: EffectRunContext = { operationId: options.operationIds.next(), sequence };
      let prepared: Result<PreparedCommand<EffectFailure>, EffectFailure>;
      try {
        prepared = await command.prepare(input, context);
      } catch (error) {
        prepared = { ok: false, error: toEffectFailure(error) };
      }
      if (!prepared.ok) return prepared;
      const execution: EffectExecution = {
        ...context,
        description: prepared.value.describe?.(),
        prepared: prepared.value,
        record(description) {
          plan.push(description ?? prepared.value.describe?.() ?? { summary: `效果 ${context.sequence}` });
        },
      };
      return chain(execution, 0);
    },
    async rollback(): Promise<RollbackReport> {
      const failures: RollbackFailure[] = [];
      let compensated = 0;
      let entry = undo.pop();
      while (entry !== undefined) {
        try {
          const result = await entry.compensate();
          if (result.ok) compensated += 1;
          else failures.push({ description: entry.description, error: result.error });
        } catch (error) {
          failures.push({ description: entry.description, error: error instanceof Error ? error : new Error(String(error)) });
        }
        entry = undo.pop();
      }
      return { compensated, failures };
    },
  };
}

export function createEffectDispatcher(options: EffectDispatcherOptions): EffectPort {
  return {
    ...createScope(options),
    createScope: () => createScope(options),
  };
}

/** Built-in dry-run plugin: records the description and short-circuits without executing. */
export function dryRunMiddleware(): EffectMiddleware {
  return {
    name: 'dry-run',
    async handle(execution) {
      execution.record();
      return ok(undefined);
    },
  };
}

export interface EffectPortOptions {
  readonly dryRun: boolean;
  readonly operationIds: OperationIdPort;
  /** Extra middlewares placed before the built-in dry-run middleware. */
  readonly middlewares?: readonly EffectMiddleware[];
}

/** Compatibility sugar: dispatcher plus optional extra middlewares and the built-in dry-run middleware. */
export function createEffectPort(options: EffectPortOptions): EffectPort {
  return createEffectDispatcher({
    operationIds: options.operationIds,
    middlewares: [...(options.middlewares ?? []), ...(options.dryRun ? [dryRunMiddleware()] : [])],
  });
}

export interface ReversibleEffectOptions<Input, E> {
  /** Required by the ops protocol so dry-run plans stay readable. */
  readonly describe: (input: Input) => CommandDescription;
  readonly execute: (input: Input, context: EffectRunContext) => Promise<Result<void, E>>;
  /** Irreversible effects omit this; the port installs a no-op compensation. */
  readonly compensate?: (input: Input, context: EffectRunContext) => Promise<Result<void, E>>;
}

/** Builds a `ReversibleCommand` from a description and execute/compensate closures. */
export function reversibleEffect<Input, E>(options: ReversibleEffectOptions<Input, E>): ReversibleCommand<Input, E> {
  return {
    kind: 'atomic',
    async prepare(input, context) {
      const prepared: PreparedCommand<E> = {
        describe: () => options.describe(input),
        execute: () => options.execute(input, context),
        compensate: () => options.compensate?.(input, context) ?? Promise.resolve(ok(undefined)),
      };
      return ok(prepared);
    },
  };
}

export interface ProcessStep {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface ProcessStepPorts {
  readonly process: ProcessPort;
  readonly reporter: Reporter;
}

/** Wraps one child process as an irreversible, described effect with the project's ok/fail reporting. */
export function processStepEffect(ports: ProcessStepPorts, step: ProcessStep, summary = [step.command, ...step.args].join(' ')): ReversibleCommand<void, EffectFailure> {
  return reversibleEffect<void, EffectFailure>({
    describe: () => ({ summary }),
    execute: async () => {
      const result = await ports.process.run(step.command, [...step.args], step.cwd);
      if (result.code === EXIT_OK) {
        ports.reporter.ok(step.label);
        return ok(undefined);
      }
      ports.reporter.fail(step.label);
      ports.reporter.info(result.stderr || result.stdout);
      return { ok: false, error: effectFailure(`${step.label}(exit ${result.code})`) } satisfies Result<void, EffectFailure>;
    },
  });
}

/** Renders the recorded plan with the shared `DRY-RUN:` prefix; a real run records nothing. */
export function reportPlan(effects: EffectScope, reporter: Reporter): void {
  for (const entry of effects.plan) reporter.info(`DRY-RUN: ${entry.summary}`);
}
