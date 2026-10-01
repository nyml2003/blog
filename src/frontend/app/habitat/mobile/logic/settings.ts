import { err, ok } from "@fluvient-loom/common";
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
} from "../settings-model";
import { readMobileSettingsAsync } from "../settings-storage";

export {
  defaultMobileSettings,
  mobileSettingsKeys,
  mobileSettingsOptions,
} from "../settings-model";
export type { MobileSettings } from "../settings-model";
export type { MobileSettingsError } from "../settings-model";
export {
  readMobileSettings,
  readMobileSettingsAsync,
} from "../settings-storage";

export type MobileSettingsCommandInput = {
  readonly previous: MobileSettings;
  readonly next: MobileSettings;
  readonly changes: Partial<MobileSettings>;
};

function settingsError(message: string): MobileSettingsError {
  return { kind: "settings", message };
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
      settingsError(cause instanceof Error ? cause.message : "设置读取失败"),
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
          const result = await persistence.write(
            mobileSettingsKeys.snapshot,
            nextValue,
          );
          return result.ok
            ? ok(undefined)
            : err(settingsError(result.error.message));
        },
        async compensate() {
          const result = await persistence.write(
            mobileSettingsKeys.snapshot,
            previousValue,
          );
          return result.ok
            ? ok(undefined)
            : err(settingsError(result.error.message));
        },
      });
    },
  };
}
