import * as core from '@actions/core';
import * as cache from '@actions/cache';
import { getInputs, validateInputs, logInputs } from './utils';

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    validateInputs(inputs);
    logInputs(inputs);

    const options = {
      uploadChunkSize: inputs.uploadChunkSize,
      enableCrossOsArchive: inputs.enableCrossOsArchive,
    };

    let cacheKey: string | undefined;
    try {
      cacheKey = await cache.restoreCache(
        inputs.paths,
        inputs.primaryKey,
        inputs.restoreKeys,
        options as any
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      core.warning(`Cache restore failed: ${errorMessage}`);
      cacheKey = undefined;
    }

    if (!cacheKey) {
      core.info('Cache not found');
      core.setOutput('cache-hit', 'false');
      core.setOutput('cache-primary-key', inputs.primaryKey);
      core.setOutput('cache-matched-key', '');
    } else {
      core.info(`Cache restored from key: ${cacheKey}`);
      const isExactKeyMatch = cacheKey === inputs.primaryKey;
      core.setOutput('cache-hit', isExactKeyMatch.toString());
      core.setOutput('cache-primary-key', inputs.primaryKey);
      core.setOutput('cache-matched-key', cacheKey);
    }

    // Save state for post action
    core.saveState('cache-primary-key', inputs.primaryKey);
    core.saveState('cache-paths', JSON.stringify(inputs.paths));
    core.saveState('cache-matched-key', cacheKey || '');
    core.saveState('upload-chunk-size', inputs.uploadChunkSize?.toString() || '');
    core.saveState('enable-cross-os-archive', inputs.enableCrossOsArchive.toString());
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    core.setFailed(`Action failed with error: ${errorMessage}`);
  }
}

if (require.main === module) {
  void run();
}

export { run };
