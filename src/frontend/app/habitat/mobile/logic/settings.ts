import { createDataTask, err, ok } from "../../../kernel";
import type {
  AsyncPersistencePort,
  CommandContext,
  DataTask,
  PersistencePort,
  ReversibleCommand,
} from "../../../kernel";
import type { Result } from "../../../kernel/result";

export type MobileTheme = "paper" | "dark" | "sepia";
export type MobileFont = "sans" | "serif" | "mono";
export interface MobileSettings {
  readonly theme: MobileTheme;
  readonly font: MobileFont;
}

export const mobileSettingsKeys = {
  snapshot: "blog.mobile.settings.v1",
  theme: "blog.mobile.theme",
  font: "blog.mobile.font",
} as const;

export const defaultMobileSettings: MobileSettings = {
  theme: "paper",
  font: "sans",
};

export const mobileSettingsOptions = {
  themes: [
    { value: "paper", label: "纸张" },
    { value: "dark", label: "暗色" },
    { value: "sepia", label: "sepia" },
  ] as const,
  fonts: [
    { value: "sans", label: "无衬线" },
    { value: "serif", label: "衬线" },
    { value: "mono", label: "等宽" },
  ] as const,
};

export function isMobileTheme(value: unknown): value is MobileTheme {
  return mobileSettingsOptions.themes.some((option) => option.value === value);
}

export function isMobileFont(value: unknown): value is MobileFont {
  return mobileSettingsOptions.fonts.some((option) => option.value === value);
}

export function normalizeMobileSettings(
  theme: unknown,
  font: unknown,
): MobileSettings {
  return {
    theme: isMobileTheme(theme) ? theme : defaultMobileSettings.theme,
    font: isMobileFont(font) ? font : defaultMobileSettings.font,
  };
}

export function readMobileSettings(
  persistence: PersistencePort,
): MobileSettings {
  const snapshot = persistence.read(mobileSettingsKeys.snapshot);
  const parsedSnapshot = snapshot.ok
    ? parseSnapshot(snapshot.value)
    : undefined;
  if (parsedSnapshot !== undefined) return parsedSnapshot;
  const theme = persistence.read(mobileSettingsKeys.theme);
  const font = persistence.read(mobileSettingsKeys.font);
  return normalizeMobileSettings(
    theme.ok ? theme.value : undefined,
    font.ok ? font.value : undefined,
  );
}

export interface MobileSettingsError {
  readonly kind: "settings";
  readonly message: string;
}

export type MobileSettingsCommandInput = {
  readonly previous: MobileSettings;
  readonly next: MobileSettings;
  readonly changes: Partial<MobileSettings>;
};

function settingsError(message: string): MobileSettingsError {
  return { kind: "settings", message };
}

function parseSnapshot(value: string | undefined): MobileSettings | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    return normalizeMobileSettings(record.theme, record.font);
  } catch {
    return undefined;
  }
}

function serialize(settings: MobileSettings): string {
  return JSON.stringify(settings);
}

export async function readMobileSettingsAsync(
  persistence: AsyncPersistencePort,
): Promise<Result<MobileSettings, MobileSettingsError>> {
  const snapshot = await persistence.read(mobileSettingsKeys.snapshot);
  if (!snapshot.ok) return err(settingsError(snapshot.error.message));
  const parsed = parseSnapshot(snapshot.value);
  if (parsed !== undefined) return ok(parsed);
  if (snapshot.value !== undefined) return ok(defaultMobileSettings);

  const legacy = await Promise.all([
    persistence.read(mobileSettingsKeys.theme),
    persistence.read(mobileSettingsKeys.font),
  ]);
  const theme = legacy[0];
  const font = legacy[1];
  if (!theme.ok) return err(settingsError(theme.error.message));
  if (!font.ok) return err(settingsError(font.error.message));
  const migrated = normalizeMobileSettings(theme.value, font.value);
  if (theme.value !== undefined || font.value !== undefined) {
    const written = await persistence.write(
      mobileSettingsKeys.snapshot,
      serialize(migrated),
    );
    if (!written.ok) return err(settingsError(written.error.message));
  }
  return ok(migrated);
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
