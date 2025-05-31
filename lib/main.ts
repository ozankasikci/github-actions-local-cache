import * as core from '@actions/core';
import { getInputs, validateInputs, logInputs } from './utils';
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

    // Create local cache directory in runner's temp space
    const cacheDir = path.join(process.env.RUNNER_TEMP || '/tmp', '.local-cache');
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
        matchedKey = key;
        cacheHit = key === inputs.primaryKey;

        // Extract cache to restore the files
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        try {
          core.info(`Extracting cache from: ${cacheFile}`);
          await execAsync(`tar -xzf "${cacheFile}" -C /`);
          core.info('Cache restored successfully');
          break;
        } catch (extractError) {
          core.warning(`Failed to extract cache: ${extractError}`);
          continue;
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
