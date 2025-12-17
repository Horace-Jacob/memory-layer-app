import Database from 'better-sqlite3';
import path from 'path';
import { app, ipcMain } from 'electron';

const db = new Database(path.join(app.getPath('userData'), 'memory-layer.db'));

export interface LocalSetting {
  localProfileId: string | null;
  onboardingCompleted: number;
  lastImportAt: string | null;
  skipOnboarding: number;
}

export const initLocalSettingDb = (): void => {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS local_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      local_profile_id TEXT,
      onboarding_completed INTEGER DEFAULT 0,
      skip_onboarding INTEGER DEFAULT 0,
      last_import_at TEXT
    );

    `
  ).run();

  db.prepare(
    `
      INSERT INTO local_settings (id)
      VALUES (1)
      ON CONFLICT(id) DO NOTHING;
    `
  ).run();
};

const getLocalSettings = (): LocalSetting => {
  const row: any = db.prepare(`SELECT * FROM local_settings WHERE id = 1`).get();

  return {
    localProfileId: row.local_profile_id,
    onboardingCompleted: row.onboarding_completed,
    lastImportAt: row.last_import_at,
    skipOnboarding: row.skip_onboarding
  };
};

const updateLocalSettings = (settings: Partial<LocalSetting>): void => {
  const current = getLocalSettings();
  const merged = {
    localProfileId: settings.localProfileId ?? current.localProfileId,
    onboardingCompleted: settings.onboardingCompleted ?? current.onboardingCompleted,
    lastImportAt: settings.lastImportAt ?? current.lastImportAt
  };

  db.prepare(
    `
      UPDATE local_settings
      SET
        local_profile_id = ?,
        onboarding_completed = ?,
        last_import_at = ?
      WHERE id = 1
    `
  ).run(merged.localProfileId, merged.onboardingCompleted ? 1 : 0, merged.lastImportAt);
};

const updateLocalProfileId = (userId: string): void => {
  db.prepare(
    `
        UPDATE local_settings
        SET local_profile_id = ?
        WHERE id = 1
      `
  ).run(userId);
};

const skipOnboarding = (): void => {
  db.prepare(
    `
        UPDATE local_settings
        SET skip_onboarding = 1
        WHERE id = 1
      `
  ).run();
};

const resetLocalSetting = (): void => {
  db.prepare(
    `
        UPDATE local_settings
        SET local_profile_id = NULL,
            onboarding_completed = 0,
            last_import_at = NULL
        WHERE id = 1
      `
  ).run();
};

export const settingIPCHandler = (): void => {
  ipcMain.handle('get-local-setting', () => {
    return getLocalSettings();
  });

  ipcMain.handle('update-local-setting', (_event, settings: Partial<LocalSetting>) => {
    updateLocalSettings(settings);
  });

  ipcMain.handle('update-local-profile-id', (_event, userId: string) => {
    updateLocalProfileId(userId);
  });

  ipcMain.handle('reset-local-setting', () => {
    resetLocalSetting();
  });

  ipcMain.handle('skip-onboarding', () => {
    skipOnboarding();
  });
};
