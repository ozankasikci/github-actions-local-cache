import * as core from '@actions/core';
import { getInputs, validateInputs, logInputs, getCacheDir } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    validateInputs(inputs);
    logInputs(inputs);

    core.info('Starting local cache restore operation...');
    core.info(`Paths to cache: ${inputs.paths.join(', ')}`);
    core.info(`Primary key: ${inputs.primaryKey}`);
    core.info(`Restore keys: ${inputs.restoreKeys?.join(', ') || 'none'}`);

    // Create local cache directory in user's cache space (persistent)
    const cacheDir = getCacheDir(inputs);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      core.info(`Created local cache directory: ${cacheDir}`);
    }

    // Try to find existing cache using primary key or restore keys
    const keysToTry = [inputs.primaryKey, ...(inputs.restoreKeys || [])];
    let matchedKey = '';
    let cacheHit = false;

    for (const key of keysToTry) {
      const keyHash = crypto.createHash('sha256').update(key).digest('hex');
      const cacheFile = path.join(cacheDir, `${keyHash}.tar.gz`);

      if (fs.existsSync(cacheFile)) {
        core.info(`Found local cache file for key: ${key}`);

        // Simple lock file approach to prevent race conditions
        const lockFile = `${cacheFile}.lock`;
        const lockTimeout = 60000; // 60 seconds
        const lockStart = Date.now();

        // Wait for any existing lock to be released
        while (fs.existsSync(lockFile)) {
          if (Date.now() - lockStart > lockTimeout) {
            core.warning(`Lock timeout exceeded for ${cacheFile}, breaking lock`);
            try {
              fs.unlinkSync(lockFile);
            } catch {
              // Ignore error if lock file was already removed
            }
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
        }

        // Create lock file
        try {
          fs.writeFileSync(lockFile, process.pid.toString());
        } catch (lockError) {
          core.warning(`Failed to create lock file: ${lockError}`);
          continue;
        }

        let cacheProcessed = false;
        try {
          // Double-check cache file still exists after acquiring lock
          if (!fs.existsSync(cacheFile)) {
            core.warning(`Cache file was removed by another process: ${cacheFile}`);
          } else {
            const stats = fs.statSync(cacheFile);
            if (stats.size === 0) {
              core.warning(`Cache file is empty, removing: ${cacheFile}`);
              fs.unlinkSync(cacheFile);
            } else {
              // Test cache file integrity using tar -tf (list without extracting)
              const { exec } = require('child_process');
              const util = require('util');
              const execAsync = util.promisify(exec);

              core.info(`Verifying cache file integrity: ${cacheFile}`);
              // Quick integrity check without listing all files (to avoid buffer overflow)
              core.info(`Performing quick integrity check...`);
              await execAsync(`tar -tzf "${cacheFile}" | head -n 1 > /dev/null`);

              matchedKey = key;
              cacheHit = key === inputs.primaryKey;

              // Extract cache to restore the files
              core.info(`Extracting cache from: ${cacheFile}`);
              core.info(`Extracting to root directory: /`);
              await execAsync(`tar -xzf "${cacheFile}" -C /`);
              core.info(`Cache restored successfully to root directory`);
              cacheProcessed = true;
            }
          }
        } catch (error) {
          core.warning(`Cache file is corrupted or invalid: ${cacheFile}`);
          core.warning(`Error: ${error}`);

          // Remove corrupted cache file to prevent future issues
          try {
            if (fs.existsSync(cacheFile)) {
              fs.unlinkSync(cacheFile);
              core.info(`Removed corrupted cache file: ${cacheFile}`);
            }
          } catch (unlinkError) {
            core.warning(`Failed to remove corrupted cache file: ${unlinkError}`);
          }
        } finally {
          // Always remove lock file
          try {
            if (fs.existsSync(lockFile)) {
              fs.unlinkSync(lockFile);
            }
          } catch (lockError) {
            core.warning(`Failed to remove lock file: ${lockError}`);
          }
        }

        if (cacheProcessed) {
          break;
        }
      }
    }

    if (matchedKey) {
      core.info(`Cache restored from key: ${matchedKey}`);
      core.setOutput('cache-hit', cacheHit.toString());
      core.setOutput('cache-primary-key', inputs.primaryKey);
      core.setOutput('cache-matched-key', matchedKey);
    } else {
      core.info('No local cache found');
      core.setOutput('cache-hit', 'false');
      core.setOutput('cache-primary-key', inputs.primaryKey);
      core.setOutput('cache-matched-key', '');
    }

    // Save state for post action
    core.saveState('cache-primary-key', inputs.primaryKey);
    core.saveState('cache-paths', JSON.stringify(inputs.paths));
    core.saveState('cache-matched-key', matchedKey);
    core.saveState('upload-chunk-size', inputs.uploadChunkSize?.toString() || '');
    core.saveState('enable-cross-os-archive', inputs.enableCrossOsArchive.toString());
    core.saveState('cache-dir', cacheDir);

    core.info('Local cache operation completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    core.setFailed(`Action failed with error: ${errorMessage}`);
  }
}

if (require.main === module) {
  void run();
}

export { run };
