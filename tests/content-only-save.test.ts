import { jest } from '@jest/globals';
import { run as runPost } from '../lib/post';
import { mockCore, mockFs, mockChildProcess, mockCrypto, resetMocks } from './setup';

describe('content-only save operation', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('single path caching', () => {
    it('should cache folder contents using parent directory and folder name', async () => {
      const testPath = '/some/long/path/to/Library';
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify([testPath]);
          case 'cache-matched-key': return 'different-key'; // Force cache save
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', testPath].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify tar command uses -C with parent directory and folder name
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/some\/long\/path\/to" "Library"/),
        expect.any(Function)
      );
    });

    it('should handle relative paths by resolving them first', async () => {
      const testPath = './Library';
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify([testPath]);
          case 'cache-matched-key': return 'different-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      // Mock path resolution to return /test/cwd/Library (from setup.ts)
      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', testPath, '/test/cwd/Library'].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify relative path is resolved and then split correctly
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/test\/cwd" "Library"/),
        expect.any(Function)
      );
    });

    it('should handle files (not just directories)', async () => {
      const testPath = '/path/to/important-file.txt';
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify([testPath]);
          case 'cache-matched-key': return 'different-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', testPath].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => false, size: 512 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify file is cached using its parent directory
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/path\/to" "important-file\.txt"/),
        expect.any(Function)
      );
    });
  });

  describe('multiple path caching', () => {
    it('should handle multiple paths with different parent directories', async () => {
      const testPaths = ['/project/Library', '/cache/node_modules', '/build/dist'];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(testPaths);
          case 'cache-matched-key': return 'different-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', ...testPaths].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify tar command includes all paths with their respective parent directories
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/project" "Library" -C "\/cache" "node_modules" -C "\/build" "dist"/),
        expect.any(Function)
      );
    });

    it('should handle mixed absolute and relative paths', async () => {
      const testPaths = ['/absolute/path/Library', './relative/cache'];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(testPaths);
          case 'cache-matched-key': return 'different-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        const allPaths = [
          '/tmp/.local-cache',
          '/absolute/path/Library',
          './relative/cache',
          '/test/cwd/relative/cache' // Resolved path
        ];
        if (allPaths.includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify both absolute and relative paths are handled correctly
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/absolute\/path" "Library" -C "\/test\/cwd\/relative" "cache"/),
        expect.any(Function)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle paths with spaces', async () => {
      const testPath = '/path with spaces/My Library';
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify([testPath]);
          case 'cache-matched-key': return 'different-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', testPath].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify paths with spaces are quoted correctly
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/path with spaces" "My Library"/),
        expect.any(Function)
      );
    });

    it('should handle root-level directories', async () => {
      const testPath = '/tmp';
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify([testPath]);
          case 'cache-matched-key': return 'different-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', testPath].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify root-level directory uses / as parent
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/" "tmp"/),
        expect.any(Function)
      );
    });

    it('should skip non-existent paths', async () => {
      const testPaths = ['/existing/Library', '/non-existent/cache'];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify(testPaths);
          case 'cache-matched-key': return 'different-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', '/existing/Library'].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false; // /non-existent/cache doesn't exist
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify only existing path is included - should be called at least once
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/existing" "Library"/),
        expect.any(Function)
      );
      
      // Verify warning is logged for non-existent path
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Path does not exist, skipping: /non-existent/cache')
      );
    });
  });

  describe('debug logging', () => {
    it('should log path processing details', async () => {
      const testPath = '/project/Unity/Library';
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'test-key-123';
          case 'cache-paths': return JSON.stringify([testPath]);
          case 'cache-matched-key': return 'different-key';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', testPath].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify debug logging shows path breakdown
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Path "/project/Unity/Library" -> Parent: "/project/Unity" -> Folder: "Library"')
      );
      
      // Verify tar command is logged
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Final tar command:')
      );
    });
  });
});