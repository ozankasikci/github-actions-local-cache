import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { generateFileChecksum, saveChecksum } from './utils';
import { getDefaultCacheDir } from './utils';
import { logger } from './logger';

function getStateFromAction(): {
  primaryKey: string;
  paths: string[];
  matchedKey: string;
  cacheDir: string;
} {
  const primaryKey = core.getState('cache-primary-key');
  const pathsJson = core.getState('cache-paths');
  const matchedKey = core.getState('cache-matched-key');
  const cacheDir = core.getState('cache-dir');

  if (!primaryKey) {
    throw new Error('No primary key found in state');
  }

  if (!pathsJson) {
    throw new Error('No cache paths found in state');
  }

  let paths: string[];
  try {
    paths = JSON.parse(pathsJson);
  } catch {
    throw new Error('Invalid cache paths JSON in state');
  }

  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('Cache paths array is empty or invalid');
  }

  return {
    primaryKey,
    paths,
    matchedKey,
    cacheDir: cacheDir || getDefaultCacheDir(),
  };
}

async function run(): Promise<void> {
  try {
    const state = getStateFromAction();

    logger.header('Local Cache Save Operation');
    logger.cache(`Primary key: ${state.primaryKey}`);
    logger.cache(`Matched key: ${state.matchedKey}`);
    logger.cache(`Cache directory: ${state.cacheDir}`);

    // Skip saving if we had an exact cache hit
    if (state.matchedKey === state.primaryKey) {
      logger.info('Exact cache hit occurred, skipping cache save', 'CACHE');
      return;
    }

    // Ensure cache directory exists
    if (!fs.existsSync(state.cacheDir)) {
      fs.mkdirSync(state.cacheDir, { recursive: true });
      logger.success(`Created cache directory: ${state.cacheDir}`, 'CACHE');
    }

    // Check which paths exist and can be cached
    const existingPaths: string[] = [];
    for (const cachePath of state.paths) {
      if (fs.existsSync(cachePath)) {
        existingPaths.push(cachePath);
        const stats = fs.statSync(cachePath);
        const absolutePath = path.isAbsolute(cachePath) ? cachePath : path.resolve(cachePath);
        logger.cache(`Will cache ${absolutePath} (${stats.isDirectory() ? 'directory' : 'file'})`);
      } else {
        const absolutePath = path.isAbsolute(cachePath) ? cachePath : path.resolve(cachePath);
        logger.warning(`Path does not exist, skipping: ${absolutePath}`, 'CACHE');
      }
    }

    if (existingPaths.length === 0) {
      logger.info('No existing paths to cache, skipping cache save', 'CACHE');
      return;
    }

    // Create cache archive
    const keyHash = crypto.createHash('sha256').update(state.primaryKey).digest('hex');
    const cacheFile = path.join(state.cacheDir, `${keyHash}.tar.gz`);

    logger.archive(`Creating cache archive: ${cacheFile}`);

    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    try {
      // Create temporary file for atomic write operation
      const tempFile = `${cacheFile}.tmp.${process.pid}.${Date.now()}`;

      logger.archive(`Creating temporary cache file: ${tempFile}`);
      logger.archive('Paths will be archived with relative paths from root /');

      try {
        // Create tar.gz archive with only folder contents, not path structure
        logger.archive('DEBUG: Processing paths for tar archive:');
        
        // For each path, we want to archive only its contents, not the full path structure
        // This way the cache works regardless of where the folder is located later
        const archiveCommands: string[] = [];
        
        for (const p of existingPaths) {
          const absolutePath = path.isAbsolute(p) ? p : path.resolve(p);
          const parentDir = path.dirname(absolutePath);
          const folderName = path.basename(absolutePath);
          
          logger.archive(`DEBUG: Path "${p}" -> Parent: "${parentDir}" -> Folder: "${folderName}"`);
          
          // Use -C to change to parent directory, then archive just the folder name
          // This stores the folder without its full path structure
          archiveCommands.push(`-C "${parentDir}" "${folderName}"`);
        }
        
        const tarCommand = `tar -czf "${tempFile}" ${archiveCommands.join(' ')}`;

        logger.archive(`DEBUG: Final tar command: ${tarCommand}`);
        logger.archive(`Running: ${tarCommand}`);
        await execAsync(tarCommand);

        // Verify temporary file was created successfully
        if (!fs.existsSync(tempFile)) {
          throw new Error('Temporary cache file was not created');
        }

        const tempStats = fs.statSync(tempFile);
        if (tempStats.size === 0) {
          throw new Error('Temporary cache file is empty');
        }

        // DEBUG: List contents of tar archive to verify what was actually stored
        logger.archive('DEBUG: Verifying tar archive contents...');
        try {
          const { stdout } = await execAsync(`tar -tzf "${tempFile}" | head -20`);
          logger.archive(`DEBUG: Archive contents (first 20 entries):\n${stdout}`);
        } catch (listError) {
          logger.warning(`DEBUG: Failed to list archive contents: ${listError}`, 'ARCHIVE');
        }

        // Atomic rename - this ensures cache file is never in partial state
        logger.archive(`Atomically moving cache file from ${tempFile} to ${cacheFile}`);
        await fs.promises.rename(tempFile, cacheFile);

        const stats = fs.statSync(cacheFile);
        logger.success(
          `Cache saved successfully. File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          'CACHE'
        );

        // Generate and save checksum for integrity verification
        logger.checksum('Generating checksum for integrity verification...');
        const checksum = await generateFileChecksum(cacheFile);
        await saveChecksum(cacheFile, checksum);
        logger.checksum(`Generated checksum: ${checksum.substring(0, 16)}...`);
        logger.footer();
      } catch (error) {
        // Clean up temporary file on any error
        try {
          if (fs.existsSync(tempFile)) {
            await fs.promises.unlink(tempFile);
            logger.cleanup(`Cleaned up temporary file: ${tempFile}`);
          }
        } catch (cleanupError) {
          logger.warning(
            `Failed to clean up temporary file ${tempFile}: ${cleanupError}`,
            'CLEANUP'
          );
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.warning(`Failed to create cache archive: ${errorMessage}`, 'ARCHIVE');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    core.setFailed(`Post action failed with error: ${errorMessage}`);
  }
}

if (require.main === module) {
  void run();
}

export { run };
