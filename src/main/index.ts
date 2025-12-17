import { app, shell, BrowserWindow, ipcMain, safeStorage, Tray, Menu } from 'electron';
import path, { join } from 'path';
import { optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/app-icon.png?asset';
import Database from 'better-sqlite3';
import { startIPCServer } from './ipc-server';
import { processedIncomingWebData } from './data-processor/web-processor';
import {
  createCacheIndex,
  createCacheTable,
  createMemoriesIndex,
  createMemoriesTable,
  deleteMemoryById
} from './database/memories';
import { initLocalSettingDb, settingIPCHandler } from './database/local-setting';
import { getBrowserHistoryWithPermission } from './browser-history-service';
import { processHistoryForOnboardingWithProgress } from './data-processor/history-processor';
import { semanticSearchWithCache } from './data-processor/semantic-search-with-cache';
import { getSearchStats } from './data-processor/sematic-search';
import { AutoUpdater } from './auto-updater';
import { registerContentFetchHandler } from './data-processor/register-content-fetch-handler';
import log from 'electron-log';

export function registerSearchHandlers(): void {
  // Semantic search
  ipcMain.handle('search:semanticSearch', async (_event, userId: string, query: string) => {
    try {
      const result = await semanticSearchWithCache(
        path.join(app.getPath('userData'), 'memory-layer.db'),
        userId,
        query
      );
      return { success: true, data: result };
    } catch (error) {
      console.error('Semantic search error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('search:getRecentSearches', async (_event, userId: string) => {
    try {
      const db = new Database(path.join(app.getPath('userData'), 'memory-layer.db'), {
        readonly: true
      });

      const searches = db
        .prepare(
          `
          SELECT original_query as query, created_at as date
          FROM recent_searches
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 5
        `
        )
        .all(userId);

      db.close();

      return { success: true, data: searches };
    } catch (error) {
      console.error('Get recent searches error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get search stats
  ipcMain.handle('search:getStats', async (_event, userId: string) => {
    try {
      const stats = getSearchStats(path.join(app.getPath('userData'), 'memory-layer.db'), userId);
      return { success: true, data: stats };
    } catch (error) {
      console.error('Get stats error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}

try {
  type QueryDBParams = string | number | boolean | null;
  let mainWindow: BrowserWindow;
  let tray: Tray;
  let updater: AutoUpdater;
  let isQuitting = false;

  let db: Database.Database;
  const PROTOCOL_SCHEME = 'com.memory-layer.app';

  if (!import.meta.env?.VITE_OPENAI_API_KEY) {
    log.warn('OpenAI key missing at startup');
  }

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
        path.resolve(process.argv[1])
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  }

  function createWindow(): void {
    // Create the browser window.
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 820,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : { icon }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    });
    mainWindow.on('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.on('close', (event) => {
      // Prevent the window from being closed to keep app in tray
      if (!isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: 'deny' };
    });

    // HMR for renderer based on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }
  }

  // function getTrayIconPath(): string {
  //   if (app.isPackaged) {
  //     return path.join(process.resourcesPath, 'app-icon.png');
  //   }
  //   return path.join(__dirname, '../../resources/app-icon.png');
  // }

  function createTray(): void {
    // const trayIconPath = getTrayIconPath();
    // const trayIcon = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open',
        click: () => {
          if (!mainWindow) createWindow();
          mainWindow?.show();
        }
      },
      {
        label: 'Quit',
        click: () => {
          // Remove the close listener so app can close
          mainWindow.removeAllListeners('close');
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Memory Layer');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      mainWindow?.show();
    });
  }

  // registerMLHandlers();
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (_event, commandLine) => {
      // Someone tried to run a second instance, we should focus our window.
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }

      // Windows/Linux: The URL is passed as a command line argument
      const url = commandLine.pop();
      if (url?.startsWith(`${PROTOCOL_SCHEME}://`)) {
        handleDeepLink(url);
      }
    });
    app.on('before-quit', () => {
      isQuitting = true;
    });
    app.whenReady().then(async () => {
      // Set app user model id for windows
      // loadLlama();
      startIPCServer(processedIncomingWebData);
      // Enable auto-launch at OS startup
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: []
      });
      createTray();

      app.on('open-url', (event, url) => {
        event.preventDefault();
        handleDeepLink(url);
      });
      db = new Database(path.join(app.getPath('userData'), 'memory-layer.db'));
      createMemoriesTable();
      createMemoriesIndex();
      createCacheTable();
      createCacheIndex();
      initLocalSettingDb();
      settingIPCHandler();
      registerSearchHandlers();
      registerContentFetchHandler();

      ipcMain.handle('check-for-updates-manual', () => {
        if (updater) {
          updater.checkForUpdates();
        }
      });

      ipcMain.handle('get-browser-history', async (_event, days: number) => {
        return await getBrowserHistoryWithPermission(days);
      });

      ipcMain.handle('delete-memory', async (_event, id: number) => {
        deleteMemoryById(id);
      });

      ipcMain.on('browser:startProcessingHistory', async (event, userId, entries) => {
        try {
          const result = await processHistoryForOnboardingWithProgress(
            userId,
            entries,
            (progress) => {
              // Send progress updates (non-blocking)
              event.sender.send('browser:processingProgress', progress);
            }
          );

          // Send completion event
          event.sender.send('browser:processingComplete', result);
        } catch (error) {
          // Send error event
          event.sender.send('browser:processingError', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      ipcMain.handle('db-query', (_event, sql: string, params: QueryDBParams[]) => {
        try {
          const stmt = db.prepare(sql);
          if (sql.trim().toUpperCase().startsWith('SELECT')) {
            return stmt.all(...params);
          } else {
            const info = stmt.run(...params);
            return info;
          }
        } catch (err) {
          console.log(err);
          throw err;
        }
      });
      createWindow();
      if (app.isPackaged && mainWindow) {
        mainWindow.webContents.once('did-finish-load', () => {
          updater = new AutoUpdater();
          updater.setMainWindow(mainWindow!);
          updater.startPeriodicCheck(4);
        });
      }
      // Default open or close DevTools by F12 in development
      // and ignore CommandOrControl + R in production.
      // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
      app.on('browser-window-created', (_, window) => {
        if (updater) {
          updater.setMainWindow(window);
        }
        optimizer.watchWindowShortcuts(window);
      });

      // IPC test
      ipcMain.on('ping', () => console.log('pong'));

      app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    });
  }

  ipcMain.handle('safe-storage-encrypt', async (_, _key: string, value: string) => {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn(
        'safeStorage is not available on this OS, falling back to plaintext (NOT RECOMMENDED for prod)'
      );
      return value; // Fallback for dev/linux without keyring
    }
    // safeStorage works with Buffers. We encrypt the string to a buffer.
    const encryptedBuffer = safeStorage.encryptString(value);
    // We return a hex string so it can be easily sent over IPC
    return encryptedBuffer.toString('hex');
  });

  ipcMain.handle('safe-storage-decrypt', async (_, _key: string, hexString: string) => {
    if (!safeStorage.isEncryptionAvailable()) return hexString;

    try {
      const encryptedBuffer = Buffer.from(hexString, 'hex');
      const decryptedString = safeStorage.decryptString(encryptedBuffer);
      return decryptedString;
    } catch {
      // If decryption fails (e.g. machine changed), return null so app logs user out
      return null;
    }
  });

  const handleDeepLink = (url: string): void => {
    // Parse the URL to get the hash or query parameters
    // Supabase usually sends: electron-app://google-auth#access_token=...&refresh_token=...
    if (mainWindow) {
      // We send the raw URL to the renderer.
      // It's safer to parse token logic in the renderer where the Supabase client lives.
      mainWindow.webContents.send('supabase-auth-callback', url);
    }
  };

  ipcMain.on('open-external-url', (_, url) => {
    shell.openExternal(url);
  });

  app.on('window-all-closed', () => {
    if (updater) {
      updater.stopPeriodicCheck();
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
} catch {
  process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (err) => {
    log.error('Unhandled Rejection:', err);
  });
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
