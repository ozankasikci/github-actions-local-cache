import * as core from '@actions/core';
import { getInputs, validateInputs, logInputs, getCacheDir, verifyChecksum } from './utils';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    validateInputs(inputs);
    logInputs(inputs);

    logger.header('Local Cache Restore Operation');
    logger.cache(`Paths to cache: ${inputs.paths.join(', ')}`);
    logger.cache(`Primary key: ${inputs.primaryKey}`);
    logger.cache(`Restore keys: ${inputs.restoreKeys?.join(', ') || 'none'}`);

    // Create local cache directory in user's cache space (persistent)
    const cacheDir = getCacheDir(inputs);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      logger.success(`Created local cache directory: ${cacheDir}`);
    }

    // Try to find existing cache using primary key or restore keys
    const keysToTry = [inputs.primaryKey, ...(inputs.restoreKeys || [])];
    let matchedKey = '';
    let cacheHit = false;

    for (const key of keysToTry) {
      const keyHash = crypto.createHash('sha256').update(key).digest('hex');
      const cacheFile = path.join(cacheDir, `${keyHash}.tar.gz`);

      if (fs.existsSync(cacheFile)) {
        logger.cache(`Found local cache file for key: ${key}`);

        // Simple lock file approach to prevent race conditions
        const lockFile = `${cacheFile}.lock`;
        const lockTimeoutMs = (inputs.lockTimeout || 60) * 1000; // Convert to milliseconds
        const lockStart = Date.now();

        // Wait for any existing lock to be released
        while (fs.existsSync(lockFile)) {
          if (Date.now() - lockStart > lockTimeoutMs) {
            logger.warning(`Lock timeout exceeded for ${cacheFile}, breaking lock`);
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
          logger.warning(`Failed to create lock file: ${lockError}`, 'LOCK');
          continue;
        }

        let cacheProcessed = false;
        try {
          // Double-check cache file still exists after acquiring lock
          if (!fs.existsSync(cacheFile)) {
            logger.warning(`Cache file was removed by another process: ${cacheFile}`, 'CACHE');
          } else {
            const stats = fs.statSync(cacheFile);
            if (stats.size === 0) {
              logger.warning(`Cache file is empty, removing: ${cacheFile}`, 'CACHE');
              fs.unlinkSync(cacheFile);
            } else {
              // Test cache file integrity using tar -tf (list without extracting)
              const { exec } = require('child_process');
              const util = require('util');
              const execAsync = util.promisify(exec);

              logger.checksum(`Verifying cache file integrity: ${cacheFile}`);

              // First check: Verify checksum if available
              const checksumValid = await verifyChecksum(cacheFile);
              if (!checksumValid) {
                logger.warning(
                  'Checksum verification failed, falling back to basic integrity check',
                  'CHECKSUM'
                );
              }

              // Second check: Quick tar integrity check without listing all files (to avoid buffer overflow)
              logger.archive(`Performing tar structure check...`);
              await execAsync(`tar -tzf "${cacheFile}" | head -n 1 > /dev/null`);

              matchedKey = key;
              cacheHit = key === inputs.primaryKey;

              // Extract cache to restore the files
              logger.archive(`Extracting cache from: ${cacheFile}`);
              logger.archive(`Extracting to root directory: /`);

              // DEBUG: List what's actually in the tar file before extraction
              logger.archive('DEBUG: Listing tar archive contents before extraction...');
              try {
                const { stdout } = await execAsync(`tar -tzf "${cacheFile}" | head -20`);
                logger.archive(`DEBUG: Archive contents (first 20 entries):\n${stdout}`);
              } catch (listError) {
                logger.warning(`DEBUG: Failed to list archive contents: ${listError}`, 'ARCHIVE');
              }

              // Extract to current target paths (not where they were originally saved from)
              logger.cache('Cache will be restored to the following absolute paths:');

              for (const cachePath of inputs.paths) {
                const absolutePath = path.isAbsolute(cachePath)
                  ? cachePath
                  : path.resolve(cachePath);
                logger.cache(`  → ${absolutePath}`);

                const parentDir = path.dirname(absolutePath);
                const folderName = path.basename(absolutePath);

                logger.archive(
                  `DEBUG: Will extract "${folderName}" to parent directory: ${parentDir}`
                );

                // Ensure parent directory exists
                if (!fs.existsSync(parentDir)) {
                  logger.archive(`DEBUG: Creating parent directory: ${parentDir}`);
                  fs.mkdirSync(parentDir, { recursive: true });
                }

                // Extract the cached folder to the target location
                const extractCommand = `tar -xzf "${cacheFile}" -C "${parentDir}"`;
                logger.archive(`DEBUG: Running extraction command: ${extractCommand}`);
                await execAsync(extractCommand);
              }

              // DEBUG: Verify extraction by checking if target paths exist
              logger.archive('DEBUG: Verifying extraction results...');
              for (const cachePath of inputs.paths) {
                const absolutePath = path.isAbsolute(cachePath)
                  ? cachePath
                  : path.resolve(cachePath);
                const exists = fs.existsSync(absolutePath);
                logger.archive(`DEBUG: Path "${absolutePath}" exists after extraction: ${exists}`);
                if (exists) {
                  try {
                    const stats = fs.statSync(absolutePath);
                    logger.archive(
                      `DEBUG: Path "${absolutePath}" is ${stats.isDirectory() ? 'directory' : 'file'}, size: ${stats.size || 'N/A'}`
                    );
                  } catch (statError) {
                    logger.warning(
                      `DEBUG: Failed to stat "${absolutePath}": ${statError}`,
                      'ARCHIVE'
                    );
                  }
                }
              }

              logger.success(`Cache restored successfully to root directory`, 'CACHE');
              cacheProcessed = true;
            }
          }
        } catch (error) {
          logger.warning(`Cache file is corrupted or invalid: ${cacheFile}`, 'CACHE');
          logger.error(`Error: ${error}`, 'CACHE');

          // Remove corrupted cache file to prevent future issues
          try {
            if (fs.existsSync(cacheFile)) {
              fs.unlinkSync(cacheFile);
              logger.cleanup(`Removed corrupted cache file: ${cacheFile}`);
            }
          } catch (unlinkError) {
            logger.warning(`Failed to remove corrupted cache file: ${unlinkError}`, 'CLEANUP');
          }
        } finally {
          // Always remove lock file
          try {
            if (fs.existsSync(lockFile)) {
              fs.unlinkSync(lockFile);
            }
          } catch (lockError) {
            logger.warning(`Failed to remove lock file: ${lockError}`, 'LOCK');
          }
        }

        if (cacheProcessed) {
          break;
        }
      }
    }

    if (matchedKey) {
      logger.success(`Cache restored from key: ${matchedKey}`, 'CACHE');
      core.setOutput('cache-hit', cacheHit.toString());
      core.setOutput('cache-primary-key', inputs.primaryKey);
      core.setOutput('cache-matched-key', matchedKey);
    } else {
      logger.info('No local cache found', 'CACHE');
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

    logger.success('Local cache operation completed successfully');
    logger.footer();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    core.setFailed(`Action failed with error: ${errorMessage}`);
  }
}

if (require.main === module) {
  void run();
}

export { run };
