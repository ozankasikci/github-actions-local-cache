import { jest } from '@jest/globals';
import { run as runPost } from '../lib/post';
import { run as runMain } from '../lib/main';
import { mockCore, mockFs, mockChildProcess, mockCrypto, resetMocks } from './setup';

// Mock util.promisify
const mockExecAsync = jest.fn() as jest.MockedFunction<any>;
jest.mock('util', () => ({
  promisify: () => mockExecAsync
}));

describe('content-only caching integration', () => {
  beforeEach(() => {
    resetMocks();
    mockExecAsync.mockReset();
  });

  describe('full save and restore cycle', () => {
    it('should save from one location and restore to a different location', async () => {
      // === SAVE PHASE ===
      const originalPath = '/original/unity/project/Library';
      
      // Setup for save operation
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'unity-library-key';
          case 'cache-paths': return JSON.stringify([originalPath]);
          case 'cache-matched-key': return 'different-key'; // Force save
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', originalPath].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 1024 * 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      // Execute save
      await runPost();

      // Verify save used content-only archiving
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/original\/unity\/project" "Library"/)
      );

      // Reset mocks for restore phase
      mockExecAsync.mockReset();
      mockCore.getInput.mockReset();
      mockCore.getState.mockReset();

      // === RESTORE PHASE ===
      const newPath = '/new/different/location/Library';
      const cacheFile = '/tmp/.local-cache/mocked-hash-1.tar.gz';

      // Setup for restore operation
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return newPath;
          case 'key': return 'unity-library-key';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      let parentDirCreated = false;
      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', cacheFile].includes(path)) return true;
        if (path === '/new/different/location' && parentDirCreated) return true;
        if (path === newPath) return false; // Target doesn't exist initially
        if (path.endsWith('.lock')) return false;
        return false;
      });

      mockFs.mkdirSync.mockImplementation(() => {
        parentDirCreated = true;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path === cacheFile) return { size: 1024 * 1024 };
        return { size: 4096 };
      });

      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});

      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/\nLibrary/Artifacts/\nLibrary/ScriptAssemblies/', stderr: '' };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      // Execute restore
      await runMain();

      // Verify restore created parent directory and extracted to new location
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/new/different/location', { recursive: true });
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*\.tar\.gz" -C "\/new\/different\/location"/)
      );
    });

    it('should handle Unity Build Service scenario with changing project paths', async () => {
      // Simulate Unity Build Service scenario where project paths change between builds
      
      // === SAVE PHASE (Build 1) ===
      const build1Path = '/Volumes/Samsung990PRO/github-actions/unity-build-service-runner-1/_work/unity-build-service/unity-build-service/UnityBuildServiceProjects/Longhorn_Game-682b2dd4bd3ef426c5c2b586/Sticker_Puzzle-682b2e9abd3ef426c5c2b6ab/sticker-puzzle/Library';
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'unity-library-macOS-hash123';
          case 'cache-paths': return JSON.stringify([build1Path]);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/Users/ozankasikci/.cache/github-actions-local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/Users/ozankasikci/.cache/github-actions-local-cache', build1Path].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 50 * 1024 * 1024 }; // 50MB Unity cache
        return { isDirectory: () => true, size: 4096 };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify save extracted only the Library folder from the complex path
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C ".*\/sticker-puzzle" "Library"/)
      );

      // Reset for restore phase
      mockExecAsync.mockReset();
      mockCore.getInput.mockReset();
      mockCore.getState.mockReset();

      // === RESTORE PHASE (Build 2 with different path) ===
      const build2Path = '/Volumes/Samsung990PRO/github-actions/unity-build-service-runner-1/_work/unity-build-service/unity-build-service/UnityBuildServiceProjects/OzanKasikci-682ca2fd8fcb2cb72a1d133d/Sticker-682ca3218fcb2cb72a1d137c/sticker-puzzle/Library';
      const cacheFile = '/Users/ozankasikci/.cache/github-actions-local-cache/mocked-hash-1.tar.gz';

      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return build2Path;
          case 'key': return 'unity-library-macOS-hash123';
          case 'restore-keys': return 'unity-library-macOS-';
          case 'cache-dir': return '/Users/ozankasikci/.cache/github-actions-local-cache';
          default: return '';
        }
      });

      const build2ProjectDir = '/Volumes/Samsung990PRO/github-actions/unity-build-service-runner-1/_work/unity-build-service/unity-build-service/UnityBuildServiceProjects/OzanKasikci-682ca2fd8fcb2cb72a1d133d/Sticker-682ca3218fcb2cb72a1d137c/sticker-puzzle';
      let build2ParentCreated = false;

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/Users/ozankasikci/.cache/github-actions-local-cache', cacheFile].includes(path)) return true;
        if (path === build2ProjectDir && build2ParentCreated) return true;
        if (path === build2Path) return false; // Target doesn't exist initially
        if (path.endsWith('.lock')) return false;
        return false;
      });

      mockFs.mkdirSync.mockImplementation((dir: string) => {
        if (dir === build2ProjectDir) {
          build2ParentCreated = true;
        }
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path === cacheFile) return { size: 50 * 1024 * 1024 };
        return { size: 4096 };
      });

      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});

      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return { 
            stdout: 'Library/\nLibrary/Artifacts/\nLibrary/ScriptAssemblies/\nLibrary/PlayerDataCache/', 
            stderr: '' 
          };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify restore worked despite completely different paths
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(build2ProjectDir, { recursive: true });
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*\.tar\.gz" -C ".*\/sticker-puzzle"/)
      );
      
      // Verify cache hit was reported
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'true');
    });

    it('should handle multiple folders being cached and restored to different locations', async () => {
      // === SAVE PHASE ===
      const originalPaths = [
        '/original/project/Library',
        '/original/project/node_modules',
        '/original/project/.cache'
      ];
      
      mockCore.getState.mockImplementation((key: string) => {
        switch (key) {
          case 'cache-primary-key': return 'multi-folder-key';
          case 'cache-paths': return JSON.stringify(originalPaths);
          case 'cache-matched-key': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', ...originalPaths].includes(path)) return true;
        if (path.includes('.tmp.')) return true;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path.includes('.tmp.')) return { size: 10 * 1024 * 1024 };
        return { isDirectory: () => true, size: 4096 };
      });

      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockFs.promises.rename.mockResolvedValue(undefined);

      await runPost();

      // Verify save command includes all folders
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -czf ".*\.tmp\..*" -C "\/original\/project" "Library" -C "\/original\/project" "node_modules" -C "\/original\/project" "\.cache"/)
      );

      // Reset for restore
      mockExecAsync.mockReset();
      mockCore.getInput.mockReset();
      mockCore.getState.mockReset();

      // === RESTORE PHASE ===
      const newPaths = [
        '/new/location/Library',
        '/new/location/node_modules', 
        '/new/location/.cache'
      ];
      const cacheFile = '/tmp/.local-cache/mocked-hash-1.tar.gz';

      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return newPaths.join('\n');
          case 'key': return 'multi-folder-key';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      let newLocationCreated = false;
      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', cacheFile].includes(path)) return true;
        if (path === '/new/location' && newLocationCreated) return true;
        if (newPaths.includes(path)) return false;
        if (path.endsWith('.lock')) return false;
        return false;
      });

      mockFs.mkdirSync.mockImplementation(() => {
        newLocationCreated = true;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path === cacheFile) return { size: 10 * 1024 * 1024 };
        return { size: 4096 };
      });

      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});

      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/\nnode_modules/\n.cache/', stderr: '' };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify all three extraction commands were called
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*\.tar\.gz" -C "\/new\/location"/)
      );
      
      // Should be called 3 times for extraction (once per path) + 2 for integrity/debug
      expect(mockExecAsync).toHaveBeenCalledTimes(5);
    });
  });

  describe('compatibility with existing caches', () => {
    it('should handle old cache format gracefully when possible', async () => {
      // Test that new restore logic doesn't break completely with old cache format
      const targetPath = '/project/Library';
      const cacheFile = '/tmp/.local-cache/old-format-cache.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPath;
          case 'key': return 'old-format-key';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('old-format-cache')
      }));

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', cacheFile, '/project'].includes(path)) return true;
        if (path.endsWith('.lock')) return false;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path === cacheFile) return { size: 1024 * 1024 };
        return { size: 4096 };
      });

      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});

      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          // Old format might have full paths
          return { stdout: 'Volumes/old/path/to/Library/\nVolumes/old/path/to/Library/file.txt', stderr: '' };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify the system doesn't crash and attempts extraction
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*\.tar\.gz" -C "\/project"/)
      );
      
      // Verify it completes without throwing errors
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'true');
    });
  });
});