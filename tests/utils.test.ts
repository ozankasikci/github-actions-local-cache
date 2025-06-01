import { getInputs, validateInputs, logInputs, generateFileChecksum, saveChecksum, verifyChecksum } from '../lib/utils';
import { mockCore } from './setup';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('utils', () => {
  describe('getInputs', () => {
    it('should parse inputs correctly', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path':
            return 'node_modules\n.cache\n  \n';
          case 'key':
            return 'test-key';
          case 'restore-keys':
            return 'fallback-1\nfallback-2';
          case 'upload-chunk-size':
            return '1024';
          case 'enableCrossOsArchive':
            return 'true';
          case 'lock-timeout':
            return '30';
          default:
            return '';
        }
      });

      const inputs = getInputs();

      expect(inputs).toEqual({
        paths: ['node_modules', '.cache'],
        primaryKey: 'test-key',
        restoreKeys: ['fallback-1', 'fallback-2'],
        uploadChunkSize: 1024,
        enableCrossOsArchive: true,
        lockTimeout: 30,
      });
    });

    it('should handle empty restore keys', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path':
            return 'node_modules';
          case 'key':
            return 'test-key';
          case 'restore-keys':
            return '';
          case 'enableCrossOsArchive':
            return 'false';
          default:
            return '';
        }
      });

      const inputs = getInputs();

      expect(inputs.restoreKeys).toBeUndefined();
      expect(inputs.enableCrossOsArchive).toBe(false);
    });

    it('should throw error for empty paths', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path':
            return '   \n  \n';
          case 'key':
            return 'test-key';
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('At least one path must be specified');
    });

    it('should throw error for empty key', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path':
            return 'node_modules';
          case 'key':
            return '   ';
          default:
            return '';
        }
      });

      expect(() => getInputs()).toThrow('Cache key cannot be empty');
    });

    it('should handle undefined upload chunk size', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path':
            return 'node_modules';
          case 'key':
            return 'test-key';
          case 'upload-chunk-size':
            return '';
          default:
            return '';
        }
      });

      const inputs = getInputs();

      expect(inputs.uploadChunkSize).toBeUndefined();
    });

    it('should use default lock timeout when not specified', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path':
            return 'node_modules';
          case 'key':
            return 'test-key';
          case 'lock-timeout':
            return '';
          default:
            return '';
        }
      });

      const inputs = getInputs();

      expect(inputs.lockTimeout).toBe(60); // Default 60 seconds
    });

    it('should parse custom lock timeout', () => {
      mockCore.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'path':
            return 'node_modules';
          case 'key':
            return 'test-key';
          case 'lock-timeout':
            return '120';
          default:
            return '';
        }
      });

      const inputs = getInputs();

      expect(inputs.lockTimeout).toBe(120);
    });
  });

  describe('validateInputs', () => {
    it('should pass validation for valid inputs', () => {
      const inputs = {
        paths: ['node_modules', '.cache'],
        primaryKey: 'test-key',
        restoreKeys: ['fallback'],
        uploadChunkSize: 1024,
        enableCrossOsArchive: false,
      };

      expect(() => validateInputs(inputs)).not.toThrow();
    });

    it('should throw error for negative upload chunk size', () => {
      const inputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        uploadChunkSize: -1,
        enableCrossOsArchive: false,
      };

      expect(() => validateInputs(inputs)).toThrow('Upload chunk size must be a positive number');
    });

    it('should throw error for zero upload chunk size', () => {
      const inputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        uploadChunkSize: 0,
        enableCrossOsArchive: false,
      };

      expect(() => validateInputs(inputs)).toThrow('Upload chunk size must be a positive number');
    });

    it('should throw error for negative lock timeout', () => {
      const inputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        lockTimeout: -30,
        enableCrossOsArchive: false,
      };

      expect(() => validateInputs(inputs)).toThrow('Lock timeout must be a positive number');
    });

    it('should throw error for zero lock timeout', () => {
      const inputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        lockTimeout: 0,
        enableCrossOsArchive: false,
      };

      expect(() => validateInputs(inputs)).toThrow('Lock timeout must be a positive number');
    });

    it('should throw error for paths containing ..', () => {
      const inputs = {
        paths: ['node_modules', '../malicious'],
        primaryKey: 'test-key',
        enableCrossOsArchive: false,
      };

      expect(() => validateInputs(inputs)).toThrow('Invalid path: ../malicious. Paths cannot contain \'..\'');
    });

    it('should allow valid relative paths', () => {
      const inputs = {
        paths: ['./node_modules', 'src/cache'],
        primaryKey: 'test-key',
        enableCrossOsArchive: false,
      };

      expect(() => validateInputs(inputs)).not.toThrow();
    });
  });

  describe('logInputs', () => {
    it('should log all input information', () => {
      const inputs = {
        paths: ['node_modules', '.cache'],
        primaryKey: 'test-key',
        restoreKeys: ['fallback-1', 'fallback-2'],
        uploadChunkSize: 1024,
        enableCrossOsArchive: true,
        lockTimeout: 120,
      };

      logInputs(inputs);

      expect(mockCore.info).toHaveBeenCalledWith('Cache key: test-key');
      expect(mockCore.info).toHaveBeenCalledWith('Cache paths: node_modules, .cache');
      expect(mockCore.info).toHaveBeenCalledWith('Restore keys: fallback-1, fallback-2');
      expect(mockCore.info).toHaveBeenCalledWith('Upload chunk size: 1024 bytes');
      expect(mockCore.info).toHaveBeenCalledWith('Cross-OS archive enabled');
      expect(mockCore.info).toHaveBeenCalledWith('Lock timeout: 120 seconds');
    });

    it('should log minimal information when optional fields are missing', () => {
      const inputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        enableCrossOsArchive: false,
      };

      logInputs(inputs);

      expect(mockCore.info).toHaveBeenCalledWith('Cache key: test-key');
      expect(mockCore.info).toHaveBeenCalledWith('Cache paths: node_modules');
      // Now includes cache directory log
      expect(mockCore.info).toHaveBeenCalledTimes(3);
    });
  });

  describe('checksum functions', () => {
    const testFile = '/tmp/test.txt';
    const testContent = 'Hello, world! This is test content for checksum generation.';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('generateFileChecksum', () => {
      it('should generate SHA-256 checksum for a file', async () => {
        // Mock createReadStream to simulate file reading
        const mockStream: any = {
          on: jest.fn((event: string, callback: Function): any => {
            if (event === 'data') {
              callback(Buffer.from(testContent));
            } else if (event === 'end') {
              callback();
            }
            return mockStream;
          })
        };
        
        (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);
        
        const checksum = await generateFileChecksum(testFile);
        
        expect(typeof checksum).toBe('string');
        expect(checksum).toBe('mocked-hash-1'); // Our mock always returns this
      });

      it('should reject for file read errors', async () => {
        // Mock createReadStream to simulate error
        const mockStream: any = {
          on: jest.fn((event: string, callback: Function): any => {
            if (event === 'error') {
              callback(new Error('File read error'));
            }
            return mockStream;
          })
        };
        
        (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);
        
        await expect(generateFileChecksum(testFile)).rejects.toThrow('File read error');
      });
    });

    describe('saveChecksum', () => {
      it('should save checksum to .sha256 file', async () => {
        const checksum = 'abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';
        await saveChecksum(testFile, checksum);
        
        expect(fs.promises.writeFile).toHaveBeenCalledWith(
          `${testFile}.sha256`,
          expect.stringContaining(checksum)
        );
      });
    });

    describe('verifyChecksum', () => {
      it('should return false for missing checksum file', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        
        const isValid = await verifyChecksum(testFile);
        expect(isValid).toBe(false);
      });

      it('should verify correct checksum', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.promises.readFile as jest.Mock).mockResolvedValue('mocked-hash-1  test.txt\n');
        
        // Mock createReadStream for generateFileChecksum call
        const mockStream: any = {
          on: jest.fn((event: string, callback: Function): any => {
            if (event === 'data') callback(Buffer.from(testContent));
            else if (event === 'end') callback();
            return mockStream;
          })
        };
        (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);
        
        const isValid = await verifyChecksum(testFile);
        expect(isValid).toBe(true);
      });

      it('should reject incorrect checksum', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.promises.readFile as jest.Mock).mockResolvedValue('wrong-checksum  test.txt\n');
        
        // Mock createReadStream for generateFileChecksum call
        const mockStream: any = {
          on: jest.fn((event: string, callback: Function): any => {
            if (event === 'data') callback(Buffer.from(testContent));
            else if (event === 'end') callback();
            return mockStream;
          })
        };
        (fs.createReadStream as jest.Mock).mockReturnValue(mockStream);
        
        const isValid = await verifyChecksum(testFile);
        expect(isValid).toBe(false);
      });

      it('should handle corrupted checksum file gracefully', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.promises.readFile as jest.Mock).mockResolvedValue('invalid format');
        
        const isValid = await verifyChecksum(testFile);
        expect(isValid).toBe(false);
      });

      it('should handle file read errors gracefully', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('Read error'));
        
        const isValid = await verifyChecksum(testFile);
        expect(isValid).toBe(false);
      });
    });
  });
});