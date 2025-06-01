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
  getCacheDir: jest.fn(() => '/home/runner/.cache/github-actions-local-cache'),
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
    it('should call getInputs, validateInputs, and logInputs', async () => {
      const inputs = {
        paths: ['node_modules', '.cache'],
        primaryKey: 'test-key-123',
        restoreKeys: ['fallback-1', 'fallback-2'],
        uploadChunkSize: 1024,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      await run();

      expect(mockGetInputs).toHaveBeenCalled();
      expect(mockValidateInputs).toHaveBeenCalledWith(inputs);
      expect(mockLogInputs).toHaveBeenCalledWith(inputs);
      expect(mockCore.info).toHaveBeenCalledWith('Starting local cache restore operation...');
    });

    it('should log cache operation details', async () => {
      const inputs = {
        paths: ['test-file.txt'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Starting local cache restore operation...');
      expect(mockCore.info).toHaveBeenCalledWith('Paths to cache: test-file.txt');
      expect(mockCore.info).toHaveBeenCalledWith('Primary key: test-key');
      expect(mockCore.info).toHaveBeenCalledWith('Restore keys: none');
    });
  });

  describe('error handling', () => {
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

  describe('extended functionality', () => {
    it('should handle basic cache operations', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'simple-key',
        restoreKeys: undefined,
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);
      
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockReturnValue(undefined);

      await run();

      expect(mockGetInputs).toHaveBeenCalled();
      expect(mockValidateInputs).toHaveBeenCalledWith(inputs);
      expect(mockLogInputs).toHaveBeenCalledWith(inputs);
      expect(mockCore.info).toHaveBeenCalledWith('Starting local cache restore operation...');
    });

    it('should handle complex input scenarios', async () => {
      const inputs = {
        paths: ['test.txt'],
        primaryKey: 'test',
        restoreKeys: [],
        uploadChunkSize: 1024,
        enableCrossOsArchive: true,
      };
      mockGetInputs.mockReturnValue(inputs);

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Starting local cache restore operation...');
      expect(mockCore.info).toHaveBeenCalledWith('Paths to cache: test.txt');
      expect(mockCore.info).toHaveBeenCalledWith('Primary key: test');
    });

    it('should verify cache integrity before extraction', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: ['fallback-key'],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      // Mock cache directory and file existence
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path.includes('.cache/github-actions-local-cache')) return true;
        if (path.includes('mocked-hash-1.tar.gz')) return true;
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });

      // Mock execAsync for integrity check and extraction
      mockExecAsync.mockImplementation((cmd: string) => {
        if (cmd.includes('tar -tzf')) {
          return Promise.resolve({ stdout: 'file1\nfile2\nfile3\n', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      await run();

      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Verifying cache file integrity:'));
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('tar -tzf'));
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('tar -xzf'));
    });

    it('should remove corrupted cache files', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      // Mock cache directory and file existence
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path.includes('.cache/github-actions-local-cache')) return true;
        if (path.includes('mocked-hash-1.tar.gz')) return true;
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });

      // Mock integrity check to fail
      mockExecAsync.mockRejectedValue(new Error('tar: corrupted file'));

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Cache file is corrupted or invalid:'));
      expect(mockFs.unlinkSync).toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Removed corrupted cache file:'));
    });

    it('should handle empty cache files', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      // Mock cache directory and file existence
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path.includes('.cache/github-actions-local-cache')) return true;
        if (path.includes('mocked-hash-1.tar.gz')) return true;
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 0 }); // Empty file

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Cache file is empty, removing:'));
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });
});