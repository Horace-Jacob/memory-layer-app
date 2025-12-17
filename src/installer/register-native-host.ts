/**
 * Windows Registry Registration for Native Messaging Host
 * This should be called during app installation
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const HOST_NAME = 'com.memorylayer.native_host';

interface ManifestConfig {
  name: string;
  description: string;
  path: string;
  type: 'stdio';
  allowed_origins: string[];
}

/**
 * Register native messaging host for Chrome/Edge on Windows
 */
export const registerNativeHost = (appPath: string, extensionId: string): void => {
  try {
    // FIX 1: Manifest should be in a user-writable location, not in Program Files
    // const manifestDir = path.join(process.env.APPDATA || '', 'MemoryLayer');

    // // Ensure directory exists
    // if (!fs.existsSync(manifestDir)) {
    //   fs.mkdirSync(manifestDir, { recursive: true });
    // }

    const manifestPath = path.join(appPath, 'native-host-manifest.json');
    // console.log('manifest path:', manifestPath);

    // FIX 2: Remove duplicate 'resources' in path
    // appPath already points to resources folder, so don't add it again
    const hostExecutablePath = path.join(process.resourcesPath, 'native-host.exe');
    // console.log('executable path:', hostExecutablePath);

    // FIX 3: Verify the executable exists
    // if (!fs.existsSync(hostExecutablePath)) {
    //   throw new Error(`Native host executable not found at: ${hostExecutablePath}`);
    // }

    const manifest: ManifestConfig = {
      name: HOST_NAME,
      description: 'MemoryLayer Desktop Native Messaging Host',
      // FIX 4: Use forward slashes or single backslashes - Chrome accepts both
      path: hostExecutablePath.replace(/\\/g, '/'),
      type: 'stdio',
      // FIX 5: Array syntax was incorrect (had backtick instead of bracket)
      allowed_origins: [`chrome-extension://${extensionId}/`]
    };

    // console.log('manifest:', manifest);

    // FIX 6: Actually write the file (was commented out)
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`✓ Created manifest at: ${manifestPath}`);

    // FIX 7: Actually register in registry (was commented out)
    registerInRegistry('Chrome', manifestPath);
    registerInRegistry('Edge', manifestPath);

    console.log('✓ Native messaging host registered successfully');
  } catch (error) {
    console.error('Failed to register native host:', error);
    throw error;
  }
};

const registerInRegistry = (browser: 'Chrome' | 'Edge', manifestPath: string): void => {
  const registryPath =
    browser === 'Chrome'
      ? `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`
      : `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`;

  try {
    // Create registry key and set default value to manifest path
    const command = `reg add "${registryPath}" /ve /t REG_SZ /d "${manifestPath}" /f`;
    execSync(command, { stdio: 'inherit' });
    // FIX 8: Proper console.log syntax (was using backticks incorrectly)
    console.log(`✓ Registered for ${browser}`);
  } catch (error) {
    // FIX 9: Proper console.warn syntax
    console.warn(`Warning: Failed to register for ${browser}:`, error);
    // Don't throw - one browser failing shouldn't stop the other
  }
};

/**
 * Unregister native messaging host (for uninstaller)
 */
export const unregisterNativeHost = (): void => {
  try {
    // Remove Chrome registry key
    try {
      execSync(
        `reg delete "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" /f`,
        {
          stdio: 'ignore'
        }
      );
      console.log('✓ Unregistered from Chrome');
    } catch (e) {
      // Key might not exist - this is fine
      console.log('Chrome registry key not found (may not have been registered)');
    }

    // Remove Edge registry key
    try {
      execSync(
        `reg delete "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}" /f`,
        {
          stdio: 'ignore'
        }
      );
      console.log('✓ Unregistered from Edge');
    } catch (e) {
      // Key might not exist - this is fine
      console.log('Edge registry key not found (may not have been registered)');
    }

    // FIX 10: Also clean up the manifest file
    try {
      const manifestDir = path.join(process.env.APPDATA || '', 'MemoryLayer');
      const manifestPath = path.join(manifestDir, 'native-host-manifest.json');
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
        console.log('✓ Removed manifest file');
      }
    } catch (e) {
      console.log('Manifest file not found or could not be removed');
    }
  } catch (error) {
    console.error('Failed to unregister native host:', error);
  }
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'register') {
    const appPath = args[1] || process.cwd();
    const extensionId = args[2] || 'lbifhofknjbeolifhcbdgfkejbejdmke';
    registerNativeHost(appPath, extensionId);
  } else if (command === 'unregister') {
    unregisterNativeHost();
  } else {
    console.log('Usage:');
    console.log('  node register-native-host.js register <app-path> <extension-id>');
    console.log('  node register-native-host.js unregister');
  }
}
