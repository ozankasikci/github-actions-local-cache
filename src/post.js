const core = require('@actions/core');
const cache = require('@actions/cache');

async function run() {
  try {
    const primaryKey = core.getState('cache-primary-key');
    const cachePaths = JSON.parse(core.getState('cache-paths') || '[]');
    const cacheMatchedKey = core.getState('cache-matched-key');
    const uploadChunkSize = core.getState('upload-chunk-size');
    const enableCrossOsArchive = core.getState('enable-cross-os-archive') === 'true';

    if (!primaryKey) {
      core.warning('No primary key found in state');
      return;
    }

    if (cachePaths.length === 0) {
      core.warning('No cache paths found in state');
      return;
    }

    if (cacheMatchedKey === primaryKey) {
      core.info(`Cache hit occurred on the primary key ${primaryKey}, not saving cache.`);
      return;
    }

    const options = {
      uploadChunkSize: uploadChunkSize ? parseInt(uploadChunkSize) : undefined,
      enableCrossOsArchive
    };

    try {
      const cacheId = await cache.saveCache(cachePaths, primaryKey, options);
      if (cacheId !== -1) {
        core.info(`Cache saved with key: ${primaryKey}`);
      } else {
        core.warning('Cache save failed');
      }
    } catch (error) {
      if (error.name === cache.ValidationError.name) {
        throw error;
      } else if (error.name === cache.ReserveCacheError.name) {
        core.info(error.message);
      } else {
        core.warning(`Cache save failed: ${error.message}`);
      }
    }

  } catch (error) {
    core.setFailed(`Post action failed with error: ${error.message}`);
  }
}

run();