import * as core from '@actions/core';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { CacheInputs } from './types';
import { logger } from './logger';

export function getInputs(): CacheInputs {
  const paths = core.getInput('path', { required: true });
  const primaryKey = core.getInput('key', { required: true });
  const restoreKeys = core.getInput('restore-keys');
  const uploadChunkSize = core.getInput('upload-chunk-size');
  const enableCrossOsArchive = core.getInput('enableCrossOsArchive') === 'true';
  const cacheDir = core.getInput('cache-dir');
  const lockTimeout = core.getInput('lock-timeout');

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
    lockTimeout: lockTimeout ? parseInt(lockTimeout, 10) : 60, // Default 60 seconds
  };
}

export function validateInputs(inputs: CacheInputs): void {
  if (inputs.uploadChunkSize !== undefined && inputs.uploadChunkSize <= 0) {
    throw new Error('Upload chunk size must be a positive number');
  }

  if (inputs.lockTimeout !== undefined && inputs.lockTimeout <= 0) {
    throw new Error('Lock timeout must be a positive number');
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

  if (inputs.lockTimeout !== undefined) {
    core.info(`Lock timeout: ${inputs.lockTimeout} seconds`);
  }

  const cacheDir = getCacheDir(inputs);
  core.info(`Cache directory: ${cacheDir}`);
}

/**
 * Generate SHA-256 checksum of a file
 */
export async function generateFileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Save checksum to a file alongside the cache file
 */
export async function saveChecksum(cacheFile: string, checksum: string): Promise<void> {
  const checksumFile = `${cacheFile}.sha256`;
  await fs.promises.writeFile(checksumFile, `${checksum}  ${path.basename(cacheFile)}\n`);
  logger.checksum(`Saved checksum to: ${checksumFile}`);
}

/**
 * Load and verify checksum from file
 */
export async function verifyChecksum(cacheFile: string): Promise<boolean> {
  const checksumFile = `${cacheFile}.sha256`;

  if (!fs.existsSync(checksumFile)) {
    logger.warning(`Checksum file not found: ${checksumFile}`, 'CHECKSUM');
    return false;
  }

  try {
    const checksumContent = await fs.promises.readFile(checksumFile, 'utf8');
    const expectedChecksum = checksumContent.split(' ')[0]?.trim();

    logger.checksum(`Verifying checksum for: ${cacheFile}`);
    const actualChecksum = await generateFileChecksum(cacheFile);

    if (expectedChecksum && expectedChecksum === actualChecksum) {
      logger.success('✅ Checksum verification passed', 'CHECKSUM');
      return true;
    } else {
      logger.warning('❌ Checksum verification failed', 'CHECKSUM');
      logger.warning(`Expected: ${expectedChecksum}`, 'CHECKSUM');
      logger.warning(`Actual: ${actualChecksum}`, 'CHECKSUM');
      return false;
    }
  } catch (error) {
    logger.warning(`Failed to verify checksum: ${error}`, 'CHECKSUM');
    return false;
  }
}
