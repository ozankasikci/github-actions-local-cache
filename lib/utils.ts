import * as core from '@actions/core';
import * as path from 'path';
import * as os from 'os';
import { CacheInputs } from './types';

export function getInputs(): CacheInputs {
  const paths = core.getInput('path', { required: true });
  const primaryKey = core.getInput('key', { required: true });
  const restoreKeys = core.getInput('restore-keys');
  const uploadChunkSize = core.getInput('upload-chunk-size');
  const enableCrossOsArchive = core.getInput('enableCrossOsArchive') === 'true';
  const cacheDir = core.getInput('cache-dir');

  const pathsArray = paths
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (pathsArray.length === 0) {
    throw new Error('At least one path must be specified');
  }

  if (!primaryKey.trim()) {
    throw new Error('Cache key cannot be empty');
  }

  const restoreKeysArray = restoreKeys
    ? restoreKeys
        .split('\n')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    : undefined;

  return {
    paths: pathsArray,
    primaryKey: primaryKey.trim(),
    restoreKeys: restoreKeysArray,
    uploadChunkSize: uploadChunkSize ? parseInt(uploadChunkSize, 10) : undefined,
    enableCrossOsArchive,
    cacheDir: cacheDir.trim() || undefined,
  };
}

export function validateInputs(inputs: CacheInputs): void {
  if (inputs.uploadChunkSize !== undefined && inputs.uploadChunkSize <= 0) {
    throw new Error('Upload chunk size must be a positive number');
  }

  for (const path of inputs.paths) {
    if (path.includes('..')) {
      throw new Error(`Invalid path: ${path}. Paths cannot contain '..'`);
    }
  }
}

export function getDefaultCacheDir(): string {
  // Use user's cache directory instead of temp directory
  // This persists across runner jobs and system restarts
  const homeDir = os.homedir();
  return path.join(homeDir, '.cache', 'github-actions-local-cache');
}

export function getCacheDir(inputs: CacheInputs): string {
  return inputs.cacheDir || getDefaultCacheDir();
}

export function logInputs(inputs: CacheInputs): void {
  core.info(`Cache key: ${inputs.primaryKey}`);
  core.info(`Cache paths: ${inputs.paths.join(', ')}`);

  if (inputs.restoreKeys && inputs.restoreKeys.length > 0) {
    core.info(`Restore keys: ${inputs.restoreKeys.join(', ')}`);
  }

  if (inputs.uploadChunkSize) {
    core.info(`Upload chunk size: ${inputs.uploadChunkSize} bytes`);
  }

  if (inputs.enableCrossOsArchive) {
    core.info('Cross-OS archive enabled');
  }

  const cacheDir = getCacheDir(inputs);
  core.info(`Cache directory: ${cacheDir}`);
}
