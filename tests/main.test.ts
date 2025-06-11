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
  verifyChecksum: jest.fn(),
}));

import { getInputs, validateInputs, logInputs, verifyChecksum } from '../lib/utils';
import { run } from '../lib/main';

const mockGetInputs = getInputs as jest.MockedFunction<typeof getInputs>;
const mockValidateInputs = validateInputs as jest.MockedFunction<typeof validateInputs>;
const mockLogInputs = logInputs as jest.MockedFunction<typeof logInputs>;
const mockVerifyChecksum = verifyChecksum as jest.MockedFunction<typeof verifyChecksum>;

describe('main', () => {
  beforeEach(() => {
    resetMocks();
    mockExecAsync.mockReset();
    mockGetInputs.mockReset();
    mockValidateInputs.mockReset();
    mockLogInputs.mockReset();
    mockVerifyChecksum.mockReset();
    
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
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('LOCAL CACHE RESTORE OPERATION'));
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

      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('LOCAL CACHE RESTORE OPERATION'));
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Paths to cache: test-file.txt'));
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Primary key: test-key'));
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Restore keys: none'));
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
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('LOCAL CACHE RESTORE OPERATION'));
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

      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('LOCAL CACHE RESTORE OPERATION'));
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Paths to cache: test.txt'));
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Primary key: test'));
    });

    it('should verify cache integrity before extraction', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: ['fallback-key'],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
        lockTimeout: 60,
        cacheDir: undefined,
      };
      mockGetInputs.mockReturnValue(inputs);

      // Mock cache directory and file existence
      // Expected path: /home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') return true;
        if (path.endsWith('.lock')) return false; // No lock file
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });
      mockFs.writeFileSync.mockImplementation(() => {}); // Lock file creation
      mockFs.unlinkSync.mockImplementation(() => {}); // Lock file removal

      // Mock checksum verification to fail so tar check runs
      mockVerifyChecksum.mockResolvedValue(false);

      // Mock execAsync for integrity check and extraction
      mockExecAsync.mockImplementation(async (cmd: string) => {
        if (cmd.includes('tar -tzf')) {
          return { stdout: 'file1\nfile2\nfile3\n', stderr: '' };
        }
        if (cmd.includes('tar -xzf')) {
          return { stdout: '', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      });

      await run();

      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Verifying cache file integrity:'));
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('tar -tzf'));
      // Now we have multiple calls: integrity check (tar -tzf), debug listing (tar -tzf), and extraction (tar -xzf) for each path
      expect(mockExecAsync).toHaveBeenCalledTimes(4); // 2 + 2 (one extract per path)
      expect(mockExecAsync).toHaveBeenLastCalledWith(expect.stringContaining('tar -xzf'));
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
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') return true;
        if (path.endsWith('.lock')) return false; // No lock file
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });
      mockFs.writeFileSync.mockImplementation(() => {}); // Lock file creation
      mockFs.unlinkSync.mockImplementation(() => {}); // File deletion

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
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') return true;
        if (path.endsWith('.lock')) return false; // No lock file
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 0 }); // Empty file
      mockFs.writeFileSync.mockImplementation(() => {}); // Lock file creation
      mockFs.unlinkSync.mockImplementation(() => {}); // File deletion

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Cache file is empty, removing:'));
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle file locking for concurrent access', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      // Track created lock files
      const createdLockFiles = new Set<string>();
      
      // Mock cache directory and file existence
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') return true;
        if (path.endsWith('.lock')) return createdLockFiles.has(path); // Lock exists if created
        return false;
      });
      
      // Track lock file creation
      mockFs.writeFileSync.mockImplementation((path: string, data: any) => {
        if (path.endsWith('.lock')) {
          createdLockFiles.add(path);
        }
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });
      mockFs.unlinkSync.mockImplementation(() => {}); // Mock lock file removal

      // Mock checksum verification to fail so tar check runs
      mockVerifyChecksum.mockResolvedValue(false);

      // Mock execAsync for integrity check and extraction
      mockExecAsync.mockImplementation((cmd: string) => {
        if (cmd.includes('head -n 1')) {
          return Promise.resolve({ stdout: '', stderr: '' });
        }
        if (cmd.includes('tar -xzf')) {
          return Promise.resolve({ stdout: '', stderr: '' });
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      await run();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.lock'),
        expect.any(String)
      );
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('.lock'));
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Performing tar structure check'));
    });

    it('should wait for existing lock to be released', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      let lockCheckCount = 0;
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz.lock') {
          lockCheckCount++;
          return lockCheckCount <= 2; // Lock exists for first 2 checks, then released
        }
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });
      mockFs.writeFileSync.mockImplementation(() => {}); // Mock lock file creation
      mockFs.unlinkSync.mockImplementation(() => {}); // Mock lock file removal

      // Mock execAsync for integrity check and extraction
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await run();

      expect(lockCheckCount).toBeGreaterThan(1); // Should have checked for lock multiple times
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.lock'),
        expect.any(String)
      );
    });

    it('should handle lock timeout and break stale locks', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      // Mock a stale lock that never gets released
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz.lock') return true; // Lock always exists (stale)
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });
      mockFs.writeFileSync.mockImplementation(() => {}); // Mock lock file creation
      mockFs.unlinkSync.mockImplementation(() => {}); // Mock lock file removal

      // Mock Date.now to simulate timeout
      const originalDateNow = Date.now;
      let callCount = 0;
      Date.now = jest.fn(() => {
        callCount++;
        return originalDateNow() + (callCount > 1 ? 65000 : 0); // Simulate timeout after first call (65s > 60s timeout)
      });

      // Mock execAsync for integrity check and extraction
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Lock timeout exceeded'));
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('.lock'));

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should handle cache file removed by another process after lock', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      let lockAcquired = false;
      const createdLockFiles = new Set<string>();
      
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') {
          // Cache file exists initially, but disappears after lock is acquired
          return !lockAcquired;
        }
        if (path.endsWith('.lock')) return createdLockFiles.has(path); // Lock exists if created
        return false;
      });

      mockFs.writeFileSync.mockImplementation((path: string) => {
        if (path.includes('.lock')) {
          lockAcquired = true; // Mark lock as acquired
          createdLockFiles.add(path);
        }
      });
      mockFs.unlinkSync.mockImplementation(() => {}); // Mock lock file removal

      mockFs.statSync.mockReturnValue({ size: 1024 });

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Cache file was removed by another process')
      );
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('.lock'));
    });

    it('should handle lock file creation failure', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') return true;
        if (path.endsWith('.lock')) return false; // No existing lock
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });
      
      // Mock lock file creation failure
      mockFs.writeFileSync.mockImplementation((path: string) => {
        if (path.includes('.lock')) {
          throw new Error('Permission denied');
        }
      });

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create lock file')
      );
    });

    it('should handle tar extraction errors gracefully', async () => {
      const inputs = {
        paths: ['package.json'],
        primaryKey: 'test-key',
        restoreKeys: [],
        uploadChunkSize: undefined,
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(inputs);

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/home/runner/.cache/github-actions-local-cache') return true;
        if (path === '/home/runner/.cache/github-actions-local-cache/mocked-hash-1.tar.gz') return true;
        if (path.endsWith('.lock')) return false; // No lock file
        return false;
      });

      mockFs.statSync.mockReturnValue({ size: 1024 });
      mockFs.writeFileSync.mockImplementation(() => {}); // Lock file creation
      mockFs.unlinkSync.mockImplementation(() => {}); // Lock file removal

      // Mock checksum verification to fail so tar check runs
      mockVerifyChecksum.mockResolvedValue(false);

      // Mock execAsync to fail on extraction
      mockExecAsync.mockImplementation((cmd: string) => {
        if (cmd.includes('tar -tzf')) {
          return Promise.resolve({ stdout: 'file1\nfile2\nfile3\n', stderr: '' });
        }
        if (cmd.includes('tar -xzf')) {
          return Promise.reject(new Error('Extraction failed'));
        }
        return Promise.resolve({ stdout: '', stderr: '' });
      });

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Cache file is corrupted or invalid')
      );
    });

  });
});