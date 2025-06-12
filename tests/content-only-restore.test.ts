import { jest } from '@jest/globals';
import { run as runMain } from '../lib/main';
import { mockCore, mockFs, mockChildProcess, mockCrypto, resetMocks } from './setup';


describe('content-only restore operation', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('single path restoration', () => {
    it('should restore folder to target location creating parent directory if needed', async () => {
      const targetPath = '/new/location/Library';
      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPath;
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash')
      }));

      let parentDirCreated = false;
      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/tmp/.local-cache' || path === cacheFile) return true;
        if (path === '/new/location' && parentDirCreated) return true;
        if (path === targetPath) return false; // Target doesn't exist initially
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

      // Mock execAsync calls: integrity check, debug listing, extraction
      let callCount = 0;
      mockChildProcess.exec.mockImplementation((cmd: string, callback: any) => {
        callCount++;
        if (callCount <= 2) {
          // Integrity and debug listing calls
          setImmediate(() => callback(null, { stdout: 'Library/\nLibrary/file1.txt\nLibrary/file2.txt', stderr: '' }));
        } else {
          // Extraction call
          setImmediate(() => callback(null, { stdout: '', stderr: '' }));
        }
        return { on: jest.fn(), removeListener: jest.fn(), stdout: null, stderr: null, kill: jest.fn() };
      });

      await runMain();

      // Verify parent directory was created
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/new/location', { recursive: true });
      
      // Verify extraction command targets the parent directory
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*test-hash\.tar\.gz" -C "\/new\/location"/)
      );
      
      // Verify debug logging
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Will extract "Library" to parent directory: /new/location')
      );
    });

    it('should not create parent directory if it already exists', async () => {
      const targetPath = '/existing/path/Library';
      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPath;
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash')
      }));

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', cacheFile, '/existing/path'].includes(path)) return true;
        if (path === targetPath) return false; // Target doesn't exist initially
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
      mockChildProcess.exec.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/\nLibrary/file1.txt', stderr: '' };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify parent directory was NOT created (since it exists)
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      
      // Verify extraction still happens to existing parent
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*test-hash\.tar\.gz" -C "\/existing\/path"/)
      );
    });
  });

  describe('multiple path restoration', () => {
    it('should restore multiple folders to their respective target locations', async () => {
      const targetPaths = ['/project/Library', '/cache/node_modules'];
      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPaths.join('\n');
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash')
      }));

      const createdDirs = new Set<string>();
      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', cacheFile].includes(path)) return true;
        if (createdDirs.has(path)) return true;
        if (targetPaths.includes(path)) return false; // Targets don't exist initially
        if (path.endsWith('.lock')) return false;
        return false;
      });

      mockFs.mkdirSync.mockImplementation((dir: string) => {
        createdDirs.add(dir);
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path === cacheFile) return { size: 1024 * 1024 };
        return { size: 4096 };
      });

      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});

      let callCount = 0;
      mockChildProcess.exec.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/\nnode_modules/', stderr: '' };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify both parent directories were created
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/project', { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/cache', { recursive: true });
      
      // Verify extraction commands for both paths
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*test-hash\.tar\.gz" -C "\/project"/)
      );
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*test-hash\.tar\.gz" -C "\/cache"/)
      );
    });
  });

  describe('relative path restoration', () => {
    it('should handle relative target paths by resolving them', async () => {
      const targetPath = './Library';
      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPath;
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash')
      }));

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', cacheFile, '/test/cwd'].includes(path)) return true;
        if (path === '/test/cwd/Library') return false; // Target doesn't exist
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
      mockChildProcess.exec.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/', stderr: '' };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify extraction uses resolved path's parent directory
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringMatching(/tar -xzf ".*test-hash\.tar\.gz" -C "\/test\/cwd"/)
      );
    });
  });

  describe('error handling', () => {
    it('should handle extraction failures gracefully', async () => {
      const targetPath = '/project/Library';
      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPath;
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash')
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
      mockChildProcess.exec.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/', stderr: '' };
        } else {
          // Extraction fails
          throw new Error('tar extraction failed');
        }
      });

      await runMain();

      // Verify error is handled and cache file might be removed
      expect(mockCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Cache file is corrupted or invalid'),
        'CACHE'
      );
    });
  });

  describe('verification', () => {
    it('should verify extracted files exist and log their details', async () => {
      const targetPath = '/project/Library';
      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPath;
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash')
      }));

      let libraryExists = false;
      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', cacheFile, '/project'].includes(path)) return true;
        if (path === targetPath && libraryExists) return true;
        if (path.endsWith('.lock')) return false;
        return false;
      });

      mockFs.statSync.mockImplementation((path: string) => {
        if (path === cacheFile) return { size: 1024 * 1024 };
        if (path === targetPath && libraryExists) return { isDirectory: () => true, size: 4096 };
        return { size: 4096 };
      });

      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});

      let callCount = 0;
      mockChildProcess.exec.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/', stderr: '' };
        } else {
          libraryExists = true; // Simulate successful extraction
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify extraction verification logs
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Path "/project/Library" exists after extraction: true')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Path "/project/Library" is directory, size: 4096')
      );
    });

    it('should log when extracted files do not exist', async () => {
      const targetPath = '/project/Library';
      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPath;
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash')
      }));

      mockFs.existsSync.mockImplementation((path: string) => {
        if (['/tmp/.local-cache', cacheFile, '/project'].includes(path)) return true;
        if (path === targetPath) return false; // Library doesn't exist after extraction
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
      mockChildProcess.exec.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/', stderr: '' };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify extraction verification logs failure
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Path "/project/Library" exists after extraction: false')
      );
    });
  });

  describe('debug logging', () => {
    it('should log detailed archive contents and extraction process', async () => {
      const targetPath = '/project/Library';
      const cacheFile = '/tmp/.local-cache/test-hash.tar.gz';
      
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path': return targetPath;
          case 'key': return 'test-key-123';
          case 'restore-keys': return '';
          case 'cache-dir': return '/tmp/.local-cache';
          default: return '';
        }
      });

      mockCrypto.createHash.mockImplementation(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash')
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
      mockChildProcess.exec.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callCount++;
        if (callCount <= 2) {
          return { stdout: 'Library/\nLibrary/file1.txt\nLibrary/subfolder/', stderr: '' };
        } else {
          return { stdout: '', stderr: '' };
        }
      });

      await runMain();

      // Verify debug logging shows archive contents
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Archive contents (first 20 entries):\nLibrary/\nLibrary/file1.txt\nLibrary/subfolder/')
      );
      
      // Verify extraction command logging
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Running extraction command: tar -xzf')
      );
    });
  });
});