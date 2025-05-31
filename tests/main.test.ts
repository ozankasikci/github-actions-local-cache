import { run } from '../lib/main';
import { mockCore, mockCache } from './setup';

// Mock the utils module
jest.mock('../lib/utils', () => ({
  getInputs: jest.fn(),
  validateInputs: jest.fn(),
  logInputs: jest.fn(),
}));

import { getInputs, validateInputs, logInputs } from '../lib/utils';

const mockGetInputs = getInputs as jest.MockedFunction<typeof getInputs>;
const mockValidateInputs = validateInputs as jest.MockedFunction<typeof validateInputs>;
const mockLogInputs = logInputs as jest.MockedFunction<typeof logInputs>;

describe('main', () => {
  const defaultInputs = {
    paths: ['node_modules', '.cache'],
    primaryKey: 'test-key-123',
    restoreKeys: ['fallback-1', 'fallback-2'],
    uploadChunkSize: 1024,
    enableCrossOsArchive: false,
  };

  beforeEach(() => {
    mockGetInputs.mockReturnValue(defaultInputs);
    mockValidateInputs.mockImplementation(() => {});
    mockLogInputs.mockImplementation(() => {});
  });

  describe('successful cache operations', () => {
    it('should handle cache hit (exact match)', async () => {
      mockCache.restoreCache.mockResolvedValue('test-key-123');

      await run();

      expect(mockCache.restoreCache).toHaveBeenCalledWith(
        ['node_modules', '.cache'],
        'test-key-123',
        ['fallback-1', 'fallback-2']
      );

      expect(mockCore.info).toHaveBeenCalledWith('Cache restored from key: test-key-123');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'true');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-primary-key', 'test-key-123');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-matched-key', 'test-key-123');

      expect(mockCore.saveState).toHaveBeenCalledWith('cache-primary-key', 'test-key-123');
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-paths', JSON.stringify(['node_modules', '.cache']));
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-matched-key', 'test-key-123');
      expect(mockCore.saveState).toHaveBeenCalledWith('upload-chunk-size', '1024');
      expect(mockCore.saveState).toHaveBeenCalledWith('enable-cross-os-archive', 'false');
    });

    it('should handle cache hit (fallback match)', async () => {
      mockCache.restoreCache.mockResolvedValue('fallback-1');

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Cache restored from key: fallback-1');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-primary-key', 'test-key-123');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-matched-key', 'fallback-1');

      expect(mockCore.saveState).toHaveBeenCalledWith('cache-matched-key', 'fallback-1');
    });

    it('should handle cache miss', async () => {
      mockCache.restoreCache.mockResolvedValue(undefined);

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Cache not found');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-primary-key', 'test-key-123');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-matched-key', '');

      expect(mockCore.saveState).toHaveBeenCalledWith('cache-matched-key', '');
    });

    it('should handle inputs without optional fields', async () => {
      const minimalInputs = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        enableCrossOsArchive: false,
      };
      mockGetInputs.mockReturnValue(minimalInputs);
      mockCache.restoreCache.mockResolvedValue(undefined);

      await run();

      expect(mockCache.restoreCache).toHaveBeenCalledWith(
        ['node_modules'],
        'test-key',
        undefined
      );

      expect(mockCore.saveState).toHaveBeenCalledWith('upload-chunk-size', '');
    });
  });

  describe('error handling', () => {
    it('should handle cache restore errors gracefully', async () => {
      const error = new Error('Cache service unavailable');
      mockCache.restoreCache.mockRejectedValue(error);

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Cache restore failed: Cache service unavailable');
      expect(mockCore.info).toHaveBeenCalledWith('Cache not found');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockCore.setOutput).toHaveBeenCalledWith('cache-matched-key', '');
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-matched-key', '');
    });

    it('should handle non-Error exceptions in cache restore', async () => {
      mockCache.restoreCache.mockRejectedValue('String error');

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Cache restore failed: Unknown error occurred');
    });

    it('should handle input validation errors', async () => {
      const error = new Error('Invalid input');
      mockValidateInputs.mockImplementation(() => {
        throw error;
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with error: Invalid input');
    });

    it('should handle getInputs errors', async () => {
      const error = new Error('Missing required input');
      mockGetInputs.mockImplementation(() => {
        throw error;
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with error: Missing required input');
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
      mockCache.restoreCache.mockResolvedValue('fallback-key');

      await run();

      expect(mockCore.saveState).toHaveBeenCalledWith('cache-primary-key', 'test-key-123');
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-paths', JSON.stringify(['node_modules', '.cache']));
      expect(mockCore.saveState).toHaveBeenCalledWith('cache-matched-key', 'fallback-key');
      expect(mockCore.saveState).toHaveBeenCalledWith('upload-chunk-size', '1024');
      expect(mockCore.saveState).toHaveBeenCalledWith('enable-cross-os-archive', 'false');
    });

    it('should save empty string for undefined values', async () => {
      const inputsWithoutOptional = {
        paths: ['node_modules'],
        primaryKey: 'test-key',
        enableCrossOsArchive: true,
      };
      mockGetInputs.mockReturnValue(inputsWithoutOptional);
      mockCache.restoreCache.mockResolvedValue(undefined);

      await run();

      expect(mockCore.saveState).toHaveBeenCalledWith('cache-matched-key', '');
      expect(mockCore.saveState).toHaveBeenCalledWith('upload-chunk-size', '');
      expect(mockCore.saveState).toHaveBeenCalledWith('enable-cross-os-archive', 'true');
    });
  });
});