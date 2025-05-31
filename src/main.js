const core = require('@actions/core');
const cache = require('@actions/cache');
const glob = require('@actions/glob');
const path = require('path');
const fs = require('fs');

async function run() {
  try {
    const paths = core.getInput('path', { required: true });
    const primaryKey = core.getInput('key', { required: true });
    const restoreKeys = core.getInput('restore-keys');
    const uploadChunkSize = core.getInput('upload-chunk-size');
    const enableCrossOsArchive = core.getInput('enableCrossOsArchive') === 'true';

    const pathsArray = paths.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    
    core.info(`Cache key: ${primaryKey}`);
    core.info(`Cache paths: ${pathsArray.join(', ')}`);

    const restoreKeysArray = restoreKeys 
      ? restoreKeys.split('\n').map(k => k.trim()).filter(k => k.length > 0)
      : undefined;

    if (restoreKeysArray && restoreKeysArray.length > 0) {
      core.info(`Restore keys: ${restoreKeysArray.join(', ')}`);
    }

    let cacheKey;
    try {
      cacheKey = await cache.restoreCache(
        pathsArray,
        primaryKey,
        restoreKeysArray,
        {
          uploadChunkSize: uploadChunkSize ? parseInt(uploadChunkSize) : undefined,
          enableCrossOsArchive
        }
      );
    } catch (error) {
      core.warning(`Cache restore failed: ${error.message}`);
      cacheKey = undefined;
    }

    if (!cacheKey) {
      core.info('Cache not found');
      core.setOutput('cache-hit', 'false');
      core.setOutput('cache-primary-key', primaryKey);
      core.setOutput('cache-matched-key', '');
    } else {
      core.info(`Cache restored from key: ${cacheKey}`);
      const isExactKeyMatch = cacheKey === primaryKey;
      core.setOutput('cache-hit', isExactKeyMatch.toString());
      core.setOutput('cache-primary-key', primaryKey);
      core.setOutput('cache-matched-key', cacheKey);
    }

    core.saveState('cache-primary-key', primaryKey);
    core.saveState('cache-paths', JSON.stringify(pathsArray));
    core.saveState('cache-matched-key', cacheKey || '');
    core.saveState('upload-chunk-size', uploadChunkSize || '');
    core.saveState('enable-cross-os-archive', enableCrossOsArchive.toString());

  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();