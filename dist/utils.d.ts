import { CacheInputs } from './types';
export declare function getInputs(): CacheInputs;
export declare function validateInputs(inputs: CacheInputs): void;
export declare function getDefaultCacheDir(): string;
export declare function getCacheDir(inputs: CacheInputs): string;
export declare function logInputs(inputs: CacheInputs): void;
/**
 * Generate SHA-256 checksum of a file
 */
export declare function generateFileChecksum(filePath: string): Promise<string>;
/**
 * Save checksum to a file alongside the cache file
 */
export declare function saveChecksum(cacheFile: string, checksum: string): Promise<void>;
/**
 * Load and verify checksum from file
 */
export declare function verifyChecksum(cacheFile: string): Promise<boolean>;
//# sourceMappingURL=utils.d.ts.map