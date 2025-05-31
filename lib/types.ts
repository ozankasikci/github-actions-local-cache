export interface CacheOptions {
  uploadChunkSize?: number;
  enableCrossOsArchive?: boolean;
}

export interface CacheInputs {
  paths: string[];
  primaryKey: string;
  restoreKeys?: string[];
  uploadChunkSize?: number;
  enableCrossOsArchive: boolean;
}

export interface CacheState {
  primaryKey: string;
  paths: string[];
  matchedKey: string;
  uploadChunkSize: string;
  enableCrossOsArchive: string;
}

export interface CacheResult {
  cacheHit: boolean;
  primaryKey: string;
  matchedKey: string;
}
