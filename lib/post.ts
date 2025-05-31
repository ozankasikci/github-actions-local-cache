import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function getStateFromAction() {
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
    cacheDir: cacheDir || path.join(process.env.RUNNER_TEMP || '/tmp', '.local-cache')
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
      // Create tar.gz archive of the paths
      const pathsStr = existingPaths.map(p => `"${p}"`).join(' ');
      const tarCommand = `tar -czf "${cacheFile}" ${pathsStr}`;
      
      core.info(`Running: ${tarCommand}`);
      await execAsync(tarCommand);
      
      const stats = fs.statSync(cacheFile);
      core.info(`Cache saved successfully. File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
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