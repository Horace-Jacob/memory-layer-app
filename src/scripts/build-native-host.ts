/**
 * Build script to package native-host.js into a standalone executable
 * Uses pkg to create a Windows .exe
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const buildNativeHost = async (): Promise<void> => {
  console.log('Building native messaging host...');

  const inputPath = path.join(__dirname, '../main/native-host.js');
  console.log('Input Path:', inputPath);
  const outputDir = path.join(__dirname, '../resources');
  const outputPath = path.join(outputDir, 'native-host.exe');

  // Ensure resources directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: ${inputPath} not found. Run build first.`);
    process.exit(1);
  }

  try {
    // Use pkg to create standalone executable
    // pkg dist/host.js --targets node18-win-x64 --output dist/host.exe
    execSync(`pkg ${inputPath} --targets node18-win-x64 --output ${outputPath}`, {
      stdio: 'inherit'
    });

    console.log(`✓ Native host built: ${outputPath}`);
  } catch (error) {
    console.error('Failed to build native host:', error);
    process.exit(1);
  }
};

buildNativeHost();
