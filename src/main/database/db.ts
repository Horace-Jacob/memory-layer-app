// --- File: db.ts (or your database connection module) ---

import Database from 'better-sqlite3';
import { createMemoriesTable } from './memories';
import { initLocalSettingDb, settingIPCHandler } from './local-setting';

let dbInstance: Database.Database | null = null;

// This function receives the secure path from main.ts
export const initializeDatabase = (dbFilePath: string): void => {
  if (dbInstance) return;

  dbInstance = new Database(dbFilePath);

  createMemoriesTable();
  initLocalSettingDb();

  settingIPCHandler();
};

export const getDB = (): Database.Database => {
  if (!dbInstance) {
    throw new Error(
      'Database not initialized! Call initializeDatabase() first in the main process.'
    );
  }
  return dbInstance;
};
