import { jest } from '@jest/globals';
import { run as runPost } from '../lib/post';
import { run as runMain } from '../lib/main';
import { mockCore, mockFs, mockChildProcess, mockCrypto, resetMocks } from './setup';
import * as path from 'path';

// Mock util.promisify
const mockExecAsync = jest.fn() as jest.MockedFunction<any>;
jest.mock('util', () => ({
  promisify: () => mockExecAsync
}));

describe('path handling', () => {
  beforeEach(() => {
    resetMocks();
    mockExecAsync.mockReset();
  });

  describe('absolute path handling', () => {
    it('should save absolute paths with -C / flag and paths stripped of leading slash', async () => {
      const absolutePaths = ['/usr/local/bin', '/opt/app/data'];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(absolutePaths);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', ...absolutePaths].includes(path)) return true;
        if (path.includes('.tmp.')) return true; // Temp file exists
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return {
          isDirectory: () => true,
          size: 4096
        };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Check that tar command uses -C / and strips leading slashes
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C \/ "usr\/local\/bin" "opt\/app\/data"/)
      );
    });

    it('should save mixed absolute paths correctly', async () => {
      const absolutePaths = [
        '/Volumes/Samsung990PRO/Projects/test/Library',
        '/home/user/.cache',
        '/var/log/app'
      ];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(absolutePaths);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', ...absolutePaths].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return {
          isDirectory: () => true,
          size: 4096
        };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify paths are stripped correctly
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C \/ "Volumes\/Samsung990PRO\/Projects\/test\/Library" "home\/user\/\.cache" "var\/log\/app"/)
      );
    });

    it('should restore absolute paths to root correctly', async () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return '/usr/local/bin\n/opt/app/data';
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      // Mock crypto to generate predictable hash
      mockCrypto.createHash.mockImplementation(() => {
        const hashObject: any = {};
        hashObject.update = jest.fn().mockReturnValue(hashObject);
        hashObject.digest = jest.fn().mockReturnValue('test-hash');
        return hashObject;
      });

      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache' || path === cacheFile) return true;
        if (path.endsWith('.lock')) return false; // No lock file exists
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path === cacheFile) return { size: 1024 * 1024 };
        return { size: 4096 };
      });

      mockFs.writeFileSync.mockImplementation(() => {}); // For lock file creation
      mockFs.unlinkSync.mockImplementation(() => {}); // For lock file removal

      // Mock execAsync for both integrity check and extraction
      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call is the integrity check
          return { stdout: '', stderr: '' };
        } else {
          // Second call is the extraction
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify extraction uses -C /
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*\.tar\.gz" -C \//)
      );
      
      // Verify logging shows absolute paths
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('→ /usr/local/bin')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('→ /opt/app/data')
      );
    });
  });

  describe('relative path handling', () => {
    it('should convert relative paths to absolute paths before saving', async () => {
      const relativePaths = ['node_modules', './dist', '../sibling/folder'];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(relativePaths);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      // Path resolution is handled by mockPath.resolve in setup.ts
      // which uses /test/cwd as the base directory

      mockFs.existsSync.mockImplementation((path: string) => {
        // Accept both relative and resolved paths
        const resolvedPaths = [
          '/tmp/.local-cache',
          'node_modules',
          './dist',
          '../sibling/folder',
          '/test/cwd/node_modules',
          '/test/cwd/dist',
          '/test/cwd/../sibling/folder'
        ];
        if (resolvedPaths.includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return {
          isDirectory: () => true,
          size: 4096
        };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify paths are resolved and stripped correctly
      // Note: mockPath.resolve preserves ./ and ../ in the path
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C \/ "test\/cwd\/node_modules" "test\/cwd\/\.\/dist" "test\/cwd\/\.\.\/sibling\/folder"/)
      );

      // No need to restore process.cwd as we're using mockPath.resolve
    });
  });

  describe('mixed path handling', () => {
    it('should handle mix of absolute and relative paths correctly', async () => {
      const mixedPaths = [
        '/usr/local/bin',
        'node_modules',
        '/Volumes/Samsung990PRO/Projects/test/Library',
        './dist',
        '/opt/app/data'
      ];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(mixedPaths);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      // Mock process.cwd() for relative path resolution
      // Path resolution is handled by mockPath.resolve in setup.ts

      mockFs.existsSync.mockImplementation((path: string) => {
        const allPaths = [
          '/tmp/.local-cache',
          '/usr/local/bin',
          'node_modules',
          '/Volumes/Samsung990PRO/Projects/test/Library',
          './dist',
          '/opt/app/data',
          '/test/cwd/node_modules',
          '/test/cwd/dist'
        ];
        if (allPaths.includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return {
          isDirectory: () => true,
          size: 4096
        };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify all paths are handled correctly
      // Note: mockPath.resolve preserves ./ in the path
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C \/ "usr\/local\/bin" "test\/cwd\/node_modules" "Volumes\/Samsung990PRO\/Projects\/test\/Library" "test\/cwd\/\.\/dist" "opt\/app\/data"/)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle root directory path correctly', async () => {
      const paths = ['/'];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(paths);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', '/'].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return {
          isDirectory: () => true,
          size: 4096
        };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Root directory should become empty string after stripping leading slash
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C \/ ""/)
      );
    });

    it('should handle paths with spaces correctly', async () => {
      const paths = ['/path with spaces/folder', 'relative path/with spaces'];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(paths);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      // Path resolution is handled by mockPath.resolve in setup.ts

      mockFs.existsSync.mockImplementation((path: string) => {
        const allPaths = [
          '/tmp/.local-cache',
          '/path with spaces/folder',
          'relative path/with spaces',
          '/test/cwd/relative path/with spaces'
        ];
        if (allPaths.includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return {
          isDirectory: () => true,
          size: 4096
        };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify paths with spaces are quoted correctly
      // Note: mockPath.resolve uses /test/cwd as base directory
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C \/ "path with spaces\/folder" "test\/cwd\/relative path\/with spaces"/)
      );
    });
  });
});