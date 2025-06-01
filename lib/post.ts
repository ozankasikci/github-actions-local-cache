import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDefaultCacheDir } from './utils';

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

    core.info('Starting local cache save operation...');
    core.info(`Primary key: ${state.primaryKey}`);
    core.info(`Matched key: ${state.matchedKey}`);
    core.info(`Cache directory: ${state.cacheDir}`);

    // Skip saving if we had an exact cache hit
    if (state.matchedKey === state.primaryKey) {
      core.info('Exact cache hit occurred, skipping cache save');
      return;
    }

    // Ensure cache directory exists
    if (!fs.existsSync(state.cacheDir)) {
      fs.mkdirSync(state.cacheDir, { recursive: true });
      core.info(`Created cache directory: ${state.cacheDir}`);
    }

    // Check which paths exist and can be cached
    const existingPaths: string[] = [];
    for (const cachePath of state.paths) {
      if (fs.existsSync(cachePath)) {
        existingPaths.push(cachePath);
        const stats = fs.statSync(cachePath);
        core.info(`Will cache ${cachePath} (${stats.isDirectory() ? 'directory' : 'file'})`);
      } else {
        core.warning(`Path does not exist, skipping: ${cachePath}`);
      }
    }

    if (existingPaths.length === 0) {
      core.info('No existing paths to cache, skipping cache save');
      return;
    }

    // Create cache archive
    const keyHash = crypto.createHash('sha256').update(state.primaryKey).digest('hex');
    const cacheFile = path.join(state.cacheDir, `${keyHash}.tar.gz`);

    core.info(`Creating cache archive: ${cacheFile}`);

    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    try {
      // Create temporary file for atomic write operation
      const tempFile = `${cacheFile}.tmp.${process.pid}.${Date.now()}`;

      core.info(`Creating temporary cache file: ${tempFile}`);

      try {
        // Create tar.gz archive to temporary file first
        const pathsStr = existingPaths.map((p) => `"${p}"`).join(' ');
        const tarCommand = `tar -czf "${tempFile}" ${pathsStr}`;

        core.info(`Running: ${tarCommand}`);
        await execAsync(tarCommand);

        // Verify temporary file was created successfully
        if (!fs.existsSync(tempFile)) {
          throw new Error('Temporary cache file was not created');
        }

        const tempStats = fs.statSync(tempFile);
        if (tempStats.size === 0) {
          throw new Error('Temporary cache file is empty');
        }

        // Atomic rename - this ensures cache file is never in partial state
        core.info(`Atomically moving cache file from ${tempFile} to ${cacheFile}`);
        await fs.promises.rename(tempFile, cacheFile);

        const stats = fs.statSync(cacheFile);
        core.info(
          `Cache saved successfully. File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
        );
      } catch (error) {
        // Clean up temporary file on any error
        try {
          if (fs.existsSync(tempFile)) {
            await fs.promises.unlink(tempFile);
            core.info(`Cleaned up temporary file: ${tempFile}`);
          }
        } catch (cleanupError) {
          core.warning(`Failed to clean up temporary file ${tempFile}: ${cleanupError}`);
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      core.warning(`Failed to create cache archive: ${errorMessage}`);
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
