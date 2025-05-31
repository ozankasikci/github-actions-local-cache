import { run } from '../lib/post';
import { mockCore, mockCache } from './setup';

describe('post', () => {
  const defaultState = {
    'cache-primary-key': 'test-key-123',
    'cache-paths': JSON.stringify(['node_modules', '.cache']),
    'cache-matched-key': 'fallback-key',
    'upload-chunk-size': '1024',
    'enable-cross-os-archive': 'true',
  };

  beforeEach(() => {
    mockCore.getState.mockImplementation((key: string) => defaultState[key as keyof typeof defaultState] || '');
  });

  describe('successful cache operations', () => {
    it('should save cache when no exact match occurred', async () => {
      mockCache.saveCache.mockResolvedValue(42);

      await run();

      expect(mockCache.saveCache).toHaveBeenCalledWith(
        ['node_modules', '.cache'],
        'test-key-123',
        {
          uploadChunkSize: 1024,
          enableCrossOsArchive: true,
        }
      );

      expect(mockCore.info).toHaveBeenCalledWith('Attempting to save cache with key: test-key-123');
      expect(mockCore.info).toHaveBeenCalledWith('Cache paths: node_modules, .cache');
      expect(mockCore.info).toHaveBeenCalledWith('Cache saved successfully with key: test-key-123');
      expect(mockCore.info).toHaveBeenCalledWith('Cache ID: 42');
    });

    it('should skip saving when exact match occurred', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        const stateWithExactMatch = {
          ...defaultState,
          'cache-matched-key': 'test-key-123', // Same as primary key
        };
        return stateWithExactMatch[key as keyof typeof stateWithExactMatch] || '';
      });

      await run();

      expect(mockCache.saveCache).not.toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith(
        'Cache hit occurred on the primary key test-key-123, not saving cache.'
      );
    });

    it('should handle cache save returning -1', async () => {
      mockCache.saveCache.mockResolvedValue(-1);

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Cache save failed - no cache ID returned');
    });

    it('should handle options without upload chunk size', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        const stateWithoutChunkSize = {
          ...defaultState,
          'upload-chunk-size': '',
        };
        return stateWithoutChunkSize[key as keyof typeof stateWithoutChunkSize] || '';
      });

      mockCache.saveCache.mockResolvedValue(42);

      await run();

      expect(mockCache.saveCache).toHaveBeenCalledWith(
        ['node_modules', '.cache'],
        'test-key-123',
        {
          uploadChunkSize: undefined,
          enableCrossOsArchive: true,
        }
      );
    });

    it('should handle cross-OS archive disabled', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        const stateWithCrossOsDisabled = {
          ...defaultState,
          'enable-cross-os-archive': 'false',
        };
        return stateWithCrossOsDisabled[key as keyof typeof stateWithCrossOsDisabled] || '';
      });

      mockCache.saveCache.mockResolvedValue(42);

      await run();

      expect(mockCache.saveCache).toHaveBeenCalledWith(
        ['node_modules', '.cache'],
        'test-key-123',
        {
          uploadChunkSize: 1024,
          enableCrossOsArchive: false,
        }
      );
    });
  });

  describe('error handling', () => {
    it('should handle missing primary key', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        if (key === 'cache-primary-key') return '';
        return defaultState[key as keyof typeof defaultState] || '';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'Post action failed with error: No primary key found in state'
      );
    });

    it('should handle missing cache paths', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        if (key === 'cache-paths') return '';
        return defaultState[key as keyof typeof defaultState] || '';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'Post action failed with error: No cache paths found in state'
      );
    });

    it('should handle invalid JSON in cache paths', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        if (key === 'cache-paths') return 'invalid-json';
        return defaultState[key as keyof typeof defaultState] || '';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'Post action failed with error: Failed to parse cache paths from state'
      );
    });

    it('should handle empty cache paths array', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        if (key === 'cache-paths') return '[]';
        return defaultState[key as keyof typeof defaultState] || '';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'Post action failed with error: Cache paths array is empty'
      );
    });

    it('should re-throw ValidationError from cache save', async () => {
      const error = new Error('Invalid cache data');
      error.name = 'ValidationError';
      mockCache.saveCache.mockRejectedValue(error);

      // ValidationError should be re-thrown and caught by the outer try-catch
      await run();
      
      expect(mockCore.setFailed).toHaveBeenCalledWith(
        'Post action failed with error: Invalid cache data'
      );
    });

    it('should handle ReserveCacheError from cache save', async () => {
      const error = new Error('Cache already exists');
      error.name = 'ReserveCacheError';
      mockCache.saveCache.mockRejectedValue(error);

      await run();

      expect(mockCore.info).toHaveBeenCalledWith('Cache already exists');
      expect(mockCore.setFailed).not.toHaveBeenCalled();
    });

    it('should handle generic cache save errors', async () => {
      const error = new Error('Network error');
      mockCache.saveCache.mockRejectedValue(error);

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Cache save failed: Network error');
      expect(mockCore.setFailed).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions in cache save', async () => {
      mockCache.saveCache.mockRejectedValue('String error');

      await run();

      expect(mockCore.warning).toHaveBeenCalledWith('Cache save failed: Unknown error occurred');
    });

    it('should handle non-Error exceptions in main flow', async () => {
      mockCore.getState.mockImplementation(() => {
        throw 'String error';
      });

      await run();

      expect(mockCore.setFailed).toHaveBeenCalledWith('Post action failed with error: Unknown error occurred');
    });
  });

  describe('state parsing', () => {
    it('should correctly parse upload chunk size as number', async () => {
      mockCore.getState.mockImplementation((key: string) => {
        const stateWithLargeChunkSize = {
          ...defaultState,
          'upload-chunk-size': '2048',
        };
        return stateWithLargeChunkSize[key as keyof typeof stateWithLargeChunkSize] || '';
      });

      mockCache.saveCache.mockResolvedValue(42);

      await run();

      expect(mockCache.saveCache).toHaveBeenCalledWith(
        ['node_modules', '.cache'],
        'test-key-123',
        {
          uploadChunkSize: 2048,
          enableCrossOsArchive: true,
        }
      );
    });

    it('should handle complex path arrays', async () => {
      const complexPaths = ['node_modules', '.cache', 'dist/assets', 'build/**/*.js'];
      mockCore.getState.mockImplementation((key: string) => {
        if (key === 'cache-paths') return JSON.stringify(complexPaths);
        return defaultState[key as keyof typeof defaultState] || '';
      });

      mockCache.saveCache.mockResolvedValue(42);

      await run();

      expect(mockCache.saveCache).toHaveBeenCalledWith(
        complexPaths,
        'test-key-123',
        {
          uploadChunkSize: 1024,
          enableCrossOsArchive: true,
        }
      );

      expect(mockCore.info).toHaveBeenCalledWith(
        'Cache paths: node_modules, .cache, dist/assets, build/**/*.js'
      );
    });
  });
});