import { jest } from '@jest/globals';
import { run } from '../lib/post';
import { mockCore, mockFs, mockChildProcess, mockCrypto, resetMocks } from './setup';

// Mock util.promisify
const mockExecAsync = jest.fn() as jest.MockedFunction<any>;
jest.mock('util', () => ({
  promisify: () => mockExecAsync
}));

describe('post', () => {
  beforeEach(() => {
    resetMocks();
    mockExecAsync.mockReset();
  });

  describe('successful cache operations', () => {
    it('should skip saving when exact match occurred', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(['node_modules']);
          case 'cache-matched-key': return 'test-key-123'; // Exact match
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Exact cache hit occurred, skipping cache save');
      expect(mockExecAsync).not.toHaveBeenCalled();
    });

    it('should handle advanced cache save scenarios', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(['node_modules', '.cache']);
          case 'cache-matched-key': return 'fallback-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return true;
        if (path === 'node_modules' || path === '.cache') return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        return { isDirectory: () => true };
      });

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Starting local cache save operation...');
      expect(mockCore.info).toHaveBeenCalledWith('Will cache node_modules (directory)');
      expect(mockCore.info).toHaveBeenCalledWith('Will cache .cache (directory)');
    });

    it('should attempt to save cache when no exact match occurred', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(['package.json']);
          case 'cache-matched-key': return 'fallback-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        return path === '/tmp/.local-cache' || path === 'package.json';
      });

      mockFs.statSync.mockReturnValue({
        isDirectory: () => false,
        size: 1024
      });

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Starting local cache save operation...');
      expect(mockCore.info).toHaveBeenCalledWith('Will cache package.json (file)');
    });

    it('should use atomic file operations with temp files', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(['package.json']);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return true;
        if (path === 'package.json') return true;
        if (path.includes('.tmp.')) return true; // Mock temp file exists after creation
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) {
          return { size: 1024 }; // Temp file has content
        }
        return {
          isDirectory: () => false,
          size: 1024
        };
      });

      // Mock fs.promises.rename for atomic operation
      mockFs.promises.rename.mockResolvedValue(undefined);

      await run();

      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Creating temporary cache file:'));
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Atomically moving cache file from'));
      expect(mockFs.promises.rename).toHaveBeenCalled();
    });

    it('should cleanup temp files on error', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(['package.json']);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return true;
        if (path === 'package.json') return true;
        if (path.includes('.tmp.')) return true; // Temp file exists for cleanup
        return false;
      });

      mockFs.statSync.mockReturnValue({
        isDirectory: () => false,
        size: 1024
      });

      // Mock execAsync to fail
      mockExecAsync.mockRejectedValue(new Error('tar command failed'));

      // Mock fs.promises.unlink for cleanup
      mockFs.promises.unlink.mockResolvedValue(undefined);

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to create cache archive:'));
      expect(mockFs.promises.unlink).toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Cleaned up temporary file:'));
    });

    it('should skip saving when no paths exist', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(['non-existent-path']);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        return path === '/tmp/.local-cache';
      });

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Path does not exist, skipping: non-existent-path');
      expect(mockCore.info).toHaveBeenCalledWith('No existing paths to cache, skipping cache save');
      expect(mockExecAsync).not.toHaveBeenCalled();
    });

    it('should create cache directory if it does not exist', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(['package.json']);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache') return false; // Cache dir doesn't exist
        if (path === 'package.json') return true;
        return false;
      });

      mockFs.statSync.mockReturnValue({
        isDirectory: () => false,
        size: 1024
      });

      await run();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/.local-cache', { recursive: true });
      expect(mockCore.info).toHaveBeenCalledWith('Created cache directory: /tmp/.local-cache');
    });
  });

  describe('error handling', () => {
    it('should handle missing primary key', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return '';
          case 'cache-paths': return JSON.stringify(['node_modules']);
          case 'cache-matched-key': return '';
          default: return '';
        }
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Post action failed with error: No primary key found in state');
    });

    it('should handle missing cache paths', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key';
          case 'cache-paths': return '';
          case 'cache-matched-key': return '';
          default: return '';
        }
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Post action failed with error: No cache paths found in state');
    });

    it('should handle invalid JSON in cache paths', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key';
          case 'cache-paths': return 'invalid-json';
          case 'cache-matched-key': return '';
          default: return '';
        }
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Post action failed with error: Invalid cache paths JSON in state');
    });

    it('should handle empty cache paths array', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key';
          case 'cache-paths': return JSON.stringify([]);
          case 'cache-matched-key': return '';
          default: return '';
        }
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Post action failed with error: Cache paths array is empty or invalid');
    });

    it('should handle non-Error exceptions in main flow', async () => {
      mockCore.getState.mockImplementation(() => {
        throw 'String error';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Post action failed with error: Unknown error occurred');
    });
  });

  describe('cache file handling', () => {
    it('should handle different file types correctly', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(['package.json', 'node_modules']);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        return path === '/tmp/.local-cache' || path === 'package.json' || path === 'node_modules';
      });

      mockFs.statSync.mockImplementation((path: string) => {
        return {
          isDirectory: () => path === 'node_modules',
          size: path === 'package.json' ? 1024 : 1024 * 1024
        };
      });

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Will cache package.json (file)');
      expect(mockCore.info).toHaveBeenCalledWith('Will cache node_modules (directory)');
    });
  });
});