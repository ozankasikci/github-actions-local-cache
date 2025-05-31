import * as core from '@actions/core';
import * as cache from '@actions/cache';
import { CacheState } from './types';

function getStateFromAction(): CacheState {
  const primaryKey = core.getState('cache-primary-key');
  const pathsJson = core.getState('cache-paths');
  const matchedKey = core.getState('cache-matched-key');
  const uploadChunkSize = core.getState('upload-chunk-size');
  const enableCrossOsArchive = core.getState('enable-cross-os-archive');

  if (!primaryKey) {
    throw new Error('No primary key found in state');
  }

  if (!pathsJson) {
    throw new Error('No cache paths found in state');
  }

  let paths: string[];
  try {
    paths = JSON.parse(pathsJson) as string[];
  } catch (error) {
    throw new Error('Failed to parse cache paths from state');
  }

  if (paths.length === 0) {
    throw new Error('Cache paths array is empty');
  }

  return {
    primaryKey,
    paths,
    matchedKey,
    uploadChunkSize,
    enableCrossOsArchive,
  };
}

async function run(): Promise<void> {
  try {
    const state = getStateFromAction();

    if (state.matchedKey === state.primaryKey) {
      core.info(`Cache hit occurred on the primary key ${state.primaryKey}, not saving cache.`);
      return;
    }

    const options = {
      uploadChunkSize: state.uploadChunkSize ? parseInt(state.uploadChunkSize, 10) : undefined,
      enableCrossOsArchive: state.enableCrossOsArchive === 'true',
    };

    core.info(`Attempting to save cache with key: ${state.primaryKey}`);
    core.info(`Cache paths: ${state.paths.join(', ')}`);

    try {
      const cacheId = await cache.saveCache(state.paths, state.primaryKey, options);
      if (cacheId !== -1) {
        core.info(`Cache saved successfully with key: ${state.primaryKey}`);
        core.info(`Cache ID: ${cacheId}`);
      } else {
        core.warning('Cache save failed - no cache ID returned');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      if (error instanceof Error && error.name === cache.ValidationError.name) {
        throw error;
      } else if (error instanceof Error && error.name === cache.ReserveCacheError.name) {
        core.info(errorMessage);
      } else {
        core.warning(`Cache save failed: ${errorMessage}`);
      }
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
