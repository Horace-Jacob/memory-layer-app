import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog, app } from 'electron';
import log from 'electron-log';

// -----------------------------------------
// Logger setup
// -----------------------------------------
autoUpdater.logger = log;
log.transports.file.level = 'info';

// Log file location for debugging
console.log('Log file location:', log.transports.file.getFile().path);

export class AutoUpdater {
  private mainWindow: BrowserWindow | null = null;
  private updateCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupAutoUpdater();
  }

  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private setupAutoUpdater(): void {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Log the app version for debugging
    log.info('App version:', app.getVersion());
    log.info('App is packaged:', app.isPackaged);

    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.sendStatusToWindow('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info.version);
      this.sendStatusToWindow(`Update available: ${info.version}`); // ✅ FIXED
      this.safeSend('update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info.version);
      this.sendStatusToWindow('App is up to date');
    });

    autoUpdater.on('download-progress', (progress) => {
      log.info(`Download speed: ${progress.bytesPerSecond} - ${progress.percent}%`); // ✅ FIXED
      this.safeSend('download-progress', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info.version);
      this.sendStatusToWindow('Update downloaded');
      this.promptUserToUpdate(info);
    });

    autoUpdater.on('error', (err) => {
      log.error('Update error:', err);
      this.sendStatusToWindow('Error checking for updates');
    });
  }

  public checkForUpdates(): void {
    log.info('Manual update check triggered');
    autoUpdater.checkForUpdatesAndNotify();
  }

  public startPeriodicCheck(intervalHours = 4): void {
    log.info(`Starting periodic update checks every ${intervalHours} hours`);

    // Initial check after 5 seconds
    setTimeout(() => {
      this.checkForUpdates();
    }, 5000);

    // Periodic checks
    this.updateCheckInterval = setInterval(
      () => {
        this.checkForUpdates();
      },
      intervalHours * 60 * 60 * 1000
    );
  }

  public stopPeriodicCheck(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
      log.info('Stopped periodic update checks');
    }
  }

  private safeSend(channel: string, payload: any): void {
    if (!this.mainWindow) return;
    if (this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send(channel, payload);
  }

  private sendStatusToWindow(message: string): void {
    log.info(message);
    this.safeSend('update-status', message);
  }

  private promptUserToUpdate(info: any): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      autoUpdater.quitAndInstall(false, true);
      return;
    }

    dialog
      .showMessageBox(this.mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'The update will be installed when you restart the app.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  }
}
