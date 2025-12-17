import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  visitTime: Date;
  visitCount: number;
  typedCount?: number;
  lastVisitTime?: Date;
}

export interface BrowserInfo {
  name: 'chrome' | 'firefox' | 'edge' | 'safari' | 'brave' | 'opera' | 'unknown';
  profilePath: string;
  historyDbPath: string;
}

export interface HistoryRetrievalResult {
  success: boolean;
  entries: BrowserHistoryEntry[];
  browser: BrowserInfo;
  error?: string;
  totalEntries: number;
  dateRange: {
    from: Date;
    to: Date;
  };
}

type BrowserType = 'chrome' | 'firefox' | 'edge' | 'brave' | 'opera';

const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'edge', 'safari', 'brave', 'opera'];

export const getBrowserHistoryWithPermission = async (
  days: number
): Promise<HistoryRetrievalResult> => {
  try {
    // 1. Detect default browser
    const browserInfo = await detectDefaultBrowser();

    if (!browserInfo) {
      return {
        success: false,
        entries: [],
        browser: { name: 'unknown', profilePath: '', historyDbPath: '' },
        error: 'Could not detect default browser',
        totalEntries: 0,
        dateRange: { from: new Date(), to: new Date() }
      };
    }

    // 2. Request permission from user
    const hasPermission = await requestUserPermission(browserInfo.name);

    if (!hasPermission) {
      return {
        success: false,
        entries: [],
        browser: browserInfo,
        error: 'User denied permission',
        totalEntries: 0,
        dateRange: { from: new Date(), to: new Date() }
      };
    }

    // 3. Retrieve history
    const result = await retrieveHistory(browserInfo, days);

    if (result.error) console.log(`Error: ${result.error}`);

    return result;
  } catch (error) {
    console.error('Failed to retrieve browser history:', error);

    return {
      success: false,
      entries: [],
      browser: { name: 'unknown', profilePath: '', historyDbPath: '' },
      error: error instanceof Error ? error.message : 'Unknown error',
      totalEntries: 0,
      dateRange: { from: new Date(), to: new Date() }
    };
  }
};

const detectDefaultBrowser = async (): Promise<BrowserInfo | null> => {
  const platform = os.platform();

  // 1. Try to get the TRUE system default from the OS
  let browserName: string | null = null;

  try {
    if (platform === 'win32') {
      browserName = getWindowsDefaultBrowser();
    } else if (platform === 'linux') {
      browserName = getLinuxDefaultBrowser();
    } else if (platform === 'darwin') {
      // macOS is harder to query natively without external libraries.
      // We will fallback to the "most recently used" heuristic for Mac.
      return await detectMostRecentBrowser();
    }
  } catch (error) {
    console.warn('Could not query OS for default browser, falling back to heuristics.', error);
  }

  // 2. If we found a specific browser name from the OS, look for its paths
  if (browserName) {
    console.log(`OS reports default browser is: ${browserName}`);
    // Map the OS name (e.g., 'google-chrome') to our internal key (e.g., 'chrome')
    const internalName = mapOsNameToInternal(browserName);

    if (internalName) {
      const info = getBrowserPaths(internalName as any, platform);
      if (info && verifyBrowserInstallation(info)) {
        return info;
      }
    }
  }

  // 3. Fallback: If OS query failed (or on Mac), use the "Most Recently Used" logic
  return await detectMostRecentBrowser();
};

// --- Helper Functions ---

const getWindowsDefaultBrowser = (): string | null => {
  try {
    // Query the UserChoice registry key for HTTP protocol
    const cmd = `reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice" /v ProgId`;
    const stdout = execSync(cmd).toString();

    // Output looks like: "ProgId    REG_SZ    ChromeHTML"
    if (stdout.includes('ChromeHTML')) return 'chrome';
    if (stdout.includes('MSEdgeHTM')) return 'edge';
    if (stdout.includes('FirefoxURL')) return 'firefox';
    if (stdout.includes('BraveHTML')) return 'brave';
    if (stdout.includes('OperaStable')) return 'opera';

    return null;
  } catch {
    return null;
  }
};

const getLinuxDefaultBrowser = (): string | null => {
  try {
    const stdout = execSync('xdg-settings get default-web-browser').toString().trim();
    // Output looks like: "google-chrome.desktop"
    if (stdout.includes('chrome')) return 'chrome';
    if (stdout.includes('firefox')) return 'firefox';
    if (stdout.includes('brave')) return 'brave';
    if (stdout.includes('opera')) return 'opera';
    if (stdout.includes('edge')) return 'edge';

    return null;
  } catch {
    return null;
  }
};

const mapOsNameToInternal = (osName: string): string | null => {
  // Simple pass-through since helpers return our internal names
  return SUPPORTED_BROWSERS.includes(osName) ? osName : null;
};

// The backup method: checks which history file was modified most recently
const detectMostRecentBrowser = async (): Promise<BrowserInfo | null> => {
  const platform = os.platform();
  let latestBrowser: BrowserInfo | null = null;
  let latestMtime = 0;

  for (const browser of SUPPORTED_BROWSERS) {
    const info = getBrowserPaths(browser as any, platform);
    if (info && verifyBrowserInstallation(info)) {
      try {
        const stats = fs.statSync(info.historyDbPath);
        if (stats.mtimeMs > latestMtime) {
          latestMtime = stats.mtimeMs;
          latestBrowser = info;
        }
      } catch {
        continue;
      }
    }
  }
  return latestBrowser;
};

const getBrowserPaths = (browser: BrowserType, platform: NodeJS.Platform): BrowserInfo | null => {
  const homeDir = os.homedir();
  let profilePath = '';
  let historyDbPath = '';

  try {
    switch (browser) {
      case 'chrome':
        if (platform === 'win32') {
          profilePath = path.join(
            homeDir,
            'AppData',
            'Local',
            'Google',
            'Chrome',
            'User Data',
            'Default'
          );
        } else if (platform === 'darwin') {
          profilePath = path.join(
            homeDir,
            'Library',
            'Application Support',
            'Google',
            'Chrome',
            'Default'
          );
        } else if (platform === 'linux') {
          profilePath = path.join(homeDir, '.config', 'google-chrome', 'Default');
        }
        historyDbPath = path.join(profilePath, 'History');
        break;

      case 'firefox':
        if (platform === 'win32') {
          const firefoxBase = path.join(
            homeDir,
            'AppData',
            'Roaming',
            'Mozilla',
            'Firefox',
            'Profiles'
          );
          profilePath = findFirefoxProfile(firefoxBase);
        } else if (platform === 'darwin') {
          const firefoxBase = path.join(
            homeDir,
            'Library',
            'Application Support',
            'Firefox',
            'Profiles'
          );
          profilePath = findFirefoxProfile(firefoxBase);
        } else if (platform === 'linux') {
          const firefoxBase = path.join(homeDir, '.mozilla', 'firefox');
          profilePath = findFirefoxProfile(firefoxBase);
        }
        historyDbPath = path.join(profilePath, 'places.sqlite');
        break;

      case 'edge':
        if (platform === 'win32') {
          profilePath = path.join(
            homeDir,
            'AppData',
            'Local',
            'Microsoft',
            'Edge',
            'User Data',
            'Default'
          );
        } else if (platform === 'darwin') {
          profilePath = path.join(
            homeDir,
            'Library',
            'Application Support',
            'Microsoft Edge',
            'Default'
          );
        } else if (platform === 'linux') {
          profilePath = path.join(homeDir, '.config', 'microsoft-edge', 'Default');
        }
        historyDbPath = path.join(profilePath, 'History');
        break;

      case 'brave':
        if (platform === 'win32') {
          profilePath = path.join(
            homeDir,
            'AppData',
            'Local',
            'BraveSoftware',
            'Brave-Browser',
            'User Data',
            'Default'
          );
        } else if (platform === 'darwin') {
          profilePath = path.join(
            homeDir,
            'Library',
            'Application Support',
            'BraveSoftware',
            'Brave-Browser',
            'Default'
          );
        } else if (platform === 'linux') {
          profilePath = path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser', 'Default');
        }
        historyDbPath = path.join(profilePath, 'History');
        break;

      case 'opera':
        if (platform === 'win32') {
          profilePath = path.join(homeDir, 'AppData', 'Roaming', 'Opera Software', 'Opera Stable');
        } else if (platform === 'darwin') {
          profilePath = path.join(
            homeDir,
            'Library',
            'Application Support',
            'com.operasoftware.Opera'
          );
        } else if (platform === 'linux') {
          profilePath = path.join(homeDir, '.config', 'opera');
        }
        historyDbPath = path.join(profilePath, 'History');
        break;

      default:
        return null;
    }

    return { name: browser, profilePath, historyDbPath };
  } catch (error) {
    console.error(`Error getting paths for ${browser}:`, error);
    return null;
  }
};

const findFirefoxProfile = (profilesDir: string): string => {
  try {
    if (!fs.existsSync(profilesDir)) {
      return '';
    }

    const profiles = fs.readdirSync(profilesDir);
    // Look for default profile (usually ends with .default or .default-release)
    const defaultProfile = profiles.find(
      (p) => p.includes('.default') || p.includes('default-release')
    );

    return defaultProfile
      ? path.join(profilesDir, defaultProfile)
      : profiles.length > 0
        ? path.join(profilesDir, profiles[0])
        : '';
  } catch (error) {
    console.error('Error finding Firefox profile:', error);
    return '';
  }
};

const verifyBrowserInstallation = (browserInfo: BrowserInfo): boolean => {
  try {
    return fs.existsSync(browserInfo.historyDbPath);
  } catch {
    return false;
  }
};

const requestUserPermission = async (browserName: string): Promise<boolean> => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Allow', 'Deny'],
    defaultId: 0,
    cancelId: 1,
    title: 'Browser History Access',
    message: `Allow access to ${browserName} browser history?`,
    detail: `This app needs to read your ${browserName} browsing history to provide personalized recommendations. Your data stays on your device and is never sent to external servers.`,
    noLink: true
  });

  return result.response === 0;
};

const retrieveHistory = async (
  browserInfo: BrowserInfo,
  days: number
): Promise<HistoryRetrievalResult> => {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  try {
    // Create a temporary copy of the history database
    // This is CRITICAL because browsers lock their history files
    const tempDbPath = await createTempHistoryCopy(browserInfo.historyDbPath);

    let entries: BrowserHistoryEntry[] = [];

    if (browserInfo.name === 'firefox') {
      entries = readFirefoxHistory(tempDbPath, fromDate, toDate);
    } else {
      // Chrome, Edge, Brave, Opera use same format
      entries = readChromiumHistory(tempDbPath, fromDate, toDate);
    }

    // Clean up temp file
    cleanupTempFile(tempDbPath);

    return {
      success: true,
      entries,
      browser: browserInfo,
      totalEntries: entries.length,
      dateRange: { from: fromDate, to: toDate }
    };
  } catch (error) {
    console.error('Error retrieving history:', error);

    return {
      success: false,
      entries: [],
      browser: browserInfo,
      error: error instanceof Error ? error.message : 'Failed to read history',
      totalEntries: 0,
      dateRange: { from: fromDate, to: toDate }
    };
  }
};

// const createTempHistoryCopy = async (historyPath: string): Promise<string> => {
//   const tempDir = app.getPath('temp');
//   const tempDbPath = path.join(tempDir, `history-copy-${Date.now()}.db`);

//   return new Promise((resolve, reject) => {
//     const readStream = fs.createReadStream(historyPath);
//     const writeStream = fs.createWriteStream(tempDbPath);

//     readStream.on('error', reject);
//     writeStream.on('error', reject);
//     writeStream.on('finish', () => resolve(tempDbPath));

//     readStream.pipe(writeStream);
//   });
// };

const createTempHistoryCopy = async (historyPath: string): Promise<string> => {
  const tempDir = app.getPath('temp');
  const tempDbPath = path.join(tempDir, `history-copy-${Date.now()}.db`);

  // fs.copyFile is often better at copying locked files than streams
  return new Promise((resolve, reject) => {
    fs.copyFile(historyPath, tempDbPath, (err) => {
      if (err) reject(err);
      else resolve(tempDbPath);
    });
  });
};

const readChromiumHistory = (
  dbPath: string,
  fromDate: Date,
  toDate: Date
): BrowserHistoryEntry[] => {
  let db: Database.Database | null = null;

  try {
    db = new Database(dbPath, { readonly: true });

    // Chromium stores time as microseconds since Jan 1, 1601
    const chromiumEpoch = new Date('1601-01-01T00:00:00Z').getTime();
    const fromTimestamp = (fromDate.getTime() - chromiumEpoch) * 1000;
    const toTimestamp = (toDate.getTime() - chromiumEpoch) * 1000;

    const query = `
          SELECT
            url,
            title,
            visit_count,
            typed_count,
            last_visit_time
          FROM urls
          WHERE last_visit_time >= ?
            AND last_visit_time <= ?
            AND url NOT LIKE 'chrome://%'
            AND url NOT LIKE 'chrome-extension://%'
            AND url NOT LIKE 'edge://%'
            AND url NOT LIKE 'brave://%'
          ORDER BY last_visit_time DESC
          LIMIT 10000
        `;

    const stmt = db.prepare(query);
    const rows = stmt.all(fromTimestamp, toTimestamp) as any[];

    return rows.map((row) => ({
      url: row.url,
      title: row.title || 'Untitled',
      visitTime: chromiumTimestampToDate(row.last_visit_time),
      visitCount: row.visit_count,
      typedCount: row.typed_count,
      lastVisitTime: chromiumTimestampToDate(row.last_visit_time)
    }));
  } catch (error) {
    console.error('Error reading Chromium history:', error);
    throw error;
  } finally {
    if (db) {
      db.close();
    }
  }
};

const readFirefoxHistory = (
  dbPath: string,
  fromDate: Date,
  toDate: Date
): BrowserHistoryEntry[] => {
  let db: Database.Database | null = null;

  try {
    db = new Database(dbPath, { readonly: true });

    // Firefox stores time as microseconds since Unix epoch
    const fromTimestamp = fromDate.getTime() * 1000;
    const toTimestamp = toDate.getTime() * 1000;

    const query = `
          SELECT
            moz_places.url,
            moz_places.title,
            moz_places.visit_count,
            moz_places.typed,
            MAX(moz_historyvisits.visit_date) as last_visit_time
          FROM moz_places
          INNER JOIN moz_historyvisits
            ON moz_places.id = moz_historyvisits.place_id
          WHERE moz_historyvisits.visit_date >= ?
            AND moz_historyvisits.visit_date <= ?
            AND moz_places.url NOT LIKE 'about:%'
            AND moz_places.url NOT LIKE 'moz-extension://%'
          GROUP BY moz_places.id
          ORDER BY last_visit_time DESC
          LIMIT 10000
        `;

    const stmt = db.prepare(query);
    const rows = stmt.all(fromTimestamp, toTimestamp) as any[];

    return rows.map((row) => ({
      url: row.url,
      title: row.title || 'Untitled',
      visitTime: new Date(row.last_visit_time / 1000),
      visitCount: row.visit_count,
      typedCount: row.typed,
      lastVisitTime: new Date(row.last_visit_time / 1000)
    }));
  } catch (error) {
    console.error('Error reading Firefox history:', error);
    throw error;
  } finally {
    if (db) {
      db.close();
    }
  }
};

const chromiumTimestampToDate = (chromiumTimestamp: number): Date => {
  const chromiumEpoch = new Date('1601-01-01T00:00:00Z').getTime();
  const unixTimestamp = chromiumEpoch + chromiumTimestamp / 1000;
  return new Date(unixTimestamp);
};

const cleanupTempFile = (tempPath: string): void => {
  try {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch (error) {
    console.error('Failed to cleanup temp file:', error);
  }
};
