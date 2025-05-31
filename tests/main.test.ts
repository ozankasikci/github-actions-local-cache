import { jest } from '@jest/globals';
import { mockCore, mockFs, mockChildProcess, mockCrypto, mockPath, resetMocks } from './setup';

// Mock util.promisify
const mockExecAsync = jest.fn() as jest.MockedFunction<any>;
jest.mock('util', () => ({
  promisify: () => mockExecAsync
}));

// Mock getInputs and related functions
jest.mock('../lib/utils', () => ({
  getInputs: jest.fn(),
  validateInputs: jest.fn(),
  logInputs: jest.fn(),
}));

import { getInputs, validateInputs, logInputs } from '../lib/utils';
import { run } from '../lib/main';

const mockGetInputs = getInputs as jest.MockedFunction<typeof getInputs>;
const mockValidateInputs = validateInputs as jest.MockedFunction<typeof validateInputs>;
const mockLogInputs = logInputs as jest.MockedFunction<typeof logInputs>;

describe('main', () => {
  beforeEach(() => {
    resetMocks();
    mockExecAsync.mockReset();
    mockGetInputs.mockReset();
    mockValidateInputs.mockReset();
    mockLogInputs.mockReset();
    
    // Set up default environment
    process.env.RUNNER_TEMP = '/tmp';
    
    // Set up default mocks that work for most tests
    mockPath.join.mockImplementation((...parts: string[]) => parts.join('/'));
    mockValidateInputs.mockImplementation(() => {}); // No-op by default
    mockLogInputs.mockImplementation(() => {}); // No-op by default
  });

  describe('successful cache operations', () => {
    it('should handle cache miss (no existing cache file)', async () => {
      const inputs = {
        paths: ['node_modules', '.cache'],
        primaryKey: 'test-key-123',
        restoreKeys: ['fallback-1', 'fallback-2'],
        uploadChunkSize: 1024,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);
      
      // Set up mocks for cache miss scenario
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return false; // Cache dir doesn't exist initially
        return false; // No cache files exist
      });
      
      mockFs.mkdirSync.mockReturnValue(undefined);
      
      await run();

      console.log('All info calls:', mockCore.info.mock.calls.map((call: any) => call[0]));
      console.log('SetOutput calls:', mockCore.setOutput.mock.calls);
      console.log('ExistsSync calls:', mockFs.existsSync.mock.calls);
      console.log('Crypto createHash calls:', mockCrypto.createHash.mock.calls.length);

      expect(mockCore.info).toHaveBeenCalledWith('Starting local cache restore operation...');
      expect(mockCore.info).toHaveBeenCalledWith('No local cache found');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-primary-key', 'test-key-123');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-matched-key', '');
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-primary-key', 'test-key-123');
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-paths', JSON.stringify(['node_modules', '.cache']));
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-matched-key', '');
    });

    it('should handle cache hit (exact match)', async () => {
      const inputs = {
        paths: ['node_modules', '.cache'],
        primaryKey: 'test-key-123',
        restoreKeys: ['fallback-1', 'fallback-2'],
        uploadChunkSize: 1024,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);
      
      // Mock cache file exists for primary key (first hash will be for primary key)
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return true; // Cache dir exists
        if (path.includes('mocked-hash-1.tar.gz')) return true; // Primary key cache file exists
        return false;
      });
      
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Found local cache file for key: test-key-123');
      expect(mockCore.info).toHaveBeenCalledWith('Cache restored successfully');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'true');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-matched-key', 'test-key-123');
    });

    it('should handle cache hit (fallback match)', async () => {
      const inputs = {
        paths: ['node_modules', '.cache'],
        primaryKey: 'test-key-123',
        restoreKeys: ['fallback-1', 'fallback-2'],
        uploadChunkSize: 1024,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);
      
      // Mock cache file exists only for second key (fallback-1)
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return true; // Cache dir exists
        if (path.includes('mocked-hash-2.tar.gz')) return true; // Fallback key cache file exists
        return false;
      });
      
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Found local cache file for key: fallback-1');
      expect(mockCore.info).toHaveBeenCalledWith('Cache restored successfully');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'false'); // Not exact match
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-matched-key', 'fallback-1');
    });

    it('should handle inputs without optional fields', async () => {
      const minimalInputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        restoreKeys: undefined,
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(minimalInputs);
      
      // Set up mocks for cache miss scenario
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return false; // Cache dir doesn't exist initially
        return false; // No cache files exist
      });
      
      mockFs.mkdirSync.mockReturnValue(undefined);

      await run();

      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-primary-key', 'test-key');
      expect(mockCore.saveState).toHaveBeenCalledWith('upload-chunk-size', '');
    });
  });

  describe('error handling', () => {
    it('should handle cache extraction errors gracefully', async () => {
      const inputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: 1024,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);
      
      // Mock cache file exists but extraction fails
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return true; // Cache dir exists
        if (path.includes('mocked-hash-1.tar.gz')) return true; // Cache file exists
        return false;
      });
      
      mockExecAsync.mockRejectedValue(new Error('Extraction failed'));

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Failed to extract cache: Error: Extraction failed');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
    });

    it('should handle getInputs errors', async () => {
      mockGetInputs.mockImplementation(() => {
        throw new Error('Input parsing failed');
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with error: Input parsing failed');
    });

    it('should handle validation errors', async () => {
      const inputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: 1024,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);
      mockValidateInputs.mockImplementation(() => {
        throw new Error('Validation failed');
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with error: Validation failed');
    });

    it('should handle non-Error exceptions in main flow', async () => {
      mockGetInputs.mockImplementation(() => {
        throw 'String error';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with error: Unknown error occurred');
    });
  });

  describe('state saving', () => {
    it('should save all required state for post action', async () => {
      const inputs = {
        paths: ['node_modules', '.cache'],
        primaryKey: 'test-key-123',
        restoreKeys: ['fallback-1'],
        uploadChunkSize: 1024,
        enableCrossOsArchive: true,
      };
      mockGetInputs.mockReturnValue(inputs);
      
      // Set up mocks for cache miss scenario
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return false; // Cache dir doesn't exist initially
        return false; // No cache files exist
      });
      
      mockFs.mkdirSync.mockReturnValue(undefined);

      await run();

      expect(mockCore.saveState).toHaveBeenCalledWith('cache-primary-key', 'test-key-123');
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-paths', JSON.stringify(['node_modules', '.cache']));
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-matched-key', '');
      expect(mockCore.saveState).toHaveBeenCalledWith('upload-chunk-size', '1024');
      expect(mockCore.saveState).toHaveBeenCalledWith('enable-cross-os-archive', 'true');
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-dir', '/tmp/.local-cache');
    });

    it('should save empty string for undefined upload chunk size', async () => {
      const inputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);
      
      // Set up mocks for cache miss scenario
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return false; // Cache dir doesn't exist initially
        return false; // No cache files exist
      });
      
      mockFs.mkdirSync.mockReturnValue(undefined);

      await run();

      expect(mockCore.saveState).toHaveBeenCalledWith('upload-chunk-size', '');
    });
  });
});