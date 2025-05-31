import { getInputs, validateInputs, logInputs } from '../lib/utils';
import { mockCore } from './setup';

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
      };

      logInputs(inputs);

      expect(mockCore.info).toHaveBeenCalledWith('Cache key: test-key');
      expect(mockCore.info).toHaveBeenCalledWith('Cache paths: node_modules, .cache');
      expect(mockCore.info).toHaveBeenCalledWith('Restore keys: fallback-1, fallback-2');
      expect(mockCore.info).toHaveBeenCalledWith('Upload chunk size: 1024 bytes');
      expect(mockCore.info).toHaveBeenCalledWith('Cross-OS archive enabled');
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
});