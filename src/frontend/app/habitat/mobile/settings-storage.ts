import { err, ok } from "@fluvient-loom/common";
import type {
  AsyncPersistencePort,
  PersistencePort,
} from "@fluvient-loom/port";
import {
  defaultMobileSettings,
  mobileSettingsKeys,
  normalizeMobileSettings,
  type MobileSettings,
  type MobileSettingsError,
} from "./settings-model";

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

export async function readMobileSettingsAsync(
  persistence: AsyncPersistencePort,
): Promise<
  import("@fluvient-loom/common").Result<MobileSettings, MobileSettingsError>
> {
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
      JSON.stringify(migrated),
    );
    if (!written.ok) return err(settingsError(written.error.message));
  }
  return ok(migrated);
}
