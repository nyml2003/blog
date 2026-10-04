import { err, ok, toErrorInfo } from "@fluvient/core";
import { createDataTask } from "@fluvient-loom/query";
import {
  type AsyncPersistencePort,
  type CommandContext,
  type DataTask,
  type ReversibleCommand,
} from "@fluvient-loom/port";
import {
  mobileSettingsKeys,
  type MobileSettings,
  type MobileSettingsError,
} from "./settings-model.ts";
import { readMobileSettingsAsync } from "./persistence.ts";

export {
  defaultMobileSettings,
  mobileSettingsKeys,
  mobileSettingsOptions,
} from "./settings-model.ts";
export type { MobileSettings } from "./settings-model.ts";
export type { MobileSettingsError } from "./settings-model.ts";
export {
  readMobileSettings,
  readMobileSettingsAsync,
} from "./persistence.ts";

export type MobileSettingsCommandInput = {
  readonly previous: MobileSettings;
  readonly next: MobileSettings;
  readonly changes: Partial<MobileSettings>;
};

function settingsError(
  message: string,
  cause?: import("@fluvient/core").ErrorInfo,
): MobileSettingsError {
  return {
    kind: "settings",
    message,
    ...(cause !== undefined ? { cause } : {}),
  };
}

function serialize(settings: MobileSettings): string {
  return JSON.stringify(settings);
}

export function createMobileSettingsReadTask(
  persistence: AsyncPersistencePort,
): DataTask<MobileSettings, MobileSettingsError> {
  return createDataTask({
    execute: () => readMobileSettingsAsync(persistence),
    mapRejected: (cause) =>
      settingsError(
        cause instanceof Error ? cause.message : "设置读取失败",
        toErrorInfo(cause),
      ),
  });
}

export function createMobileSettingsCommand(
  persistence: AsyncPersistencePort,
): ReversibleCommand<MobileSettingsCommandInput, MobileSettingsError> {
  return {
    kind: "atomic",
    async prepare(input: MobileSettingsCommandInput, _context: CommandContext) {
      const nextValue = serialize(input.next);
      const previousValue = serialize(input.previous);
      return ok({
        async execute() {
          const result = await persistence.write({
            key: mobileSettingsKeys.snapshot,
            value: nextValue,
          });
          return result.ok
            ? ok(undefined)
            : err(settingsError(result.error.message, result.error.cause));
        },
        async compensate() {
          const result = await persistence.write({
            key: mobileSettingsKeys.snapshot,
            value: previousValue,
          });
          return result.ok
            ? ok(undefined)
            : err(settingsError(result.error.message, result.error.cause));
        },
      });
    },
  };
}
