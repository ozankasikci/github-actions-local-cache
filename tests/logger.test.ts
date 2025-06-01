import { logger } from '../lib/logger';
import { mockCore } from './setup';

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic logging methods', () => {
    it('should log info messages', () => {
      logger.info('test message');
      expect(mockCore.info).toHaveBeenCalled();
    });

    it('should log success messages', () => {
      logger.success('test success');
      expect(mockCore.info).toHaveBeenCalled();
    });

    it('should log warning messages', () => {
      logger.warning('test warning');
      expect(mockCore.warning).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      logger.error('test error');
      expect(mockCore.error).toHaveBeenCalled();
    });

    it('should log debug messages', () => {
      logger.debug('test debug');
      expect(mockCore.debug).toHaveBeenCalled();
    });
  });

  describe('specialized logging methods', () => {
    it('should log cache messages', () => {
      logger.cache('cache operation');
      expect(mockCore.info).toHaveBeenCalled();
    });

    it('should log checksum messages', () => {
      logger.checksum('checksum operation');
      expect(mockCore.info).toHaveBeenCalled();
    });

    it('should log archive messages', () => {
      logger.archive('archive operation');
      expect(mockCore.info).toHaveBeenCalled();
    });

    it('should log lock messages', () => {
      logger.lock('lock operation');
      expect(mockCore.info).toHaveBeenCalled();
    });

    it('should log cleanup messages', () => {
      logger.cleanup('cleanup operation');
      expect(mockCore.info).toHaveBeenCalled();
    });

    it('should log timer messages', () => {
      logger.timer('timer operation');
      expect(mockCore.info).toHaveBeenCalled();
    });

  });

  describe('utility functions', () => {
    it('should log progress with percentage', () => {
      logger.progress('Processing files', 50, 100);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Processing files')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('50/100')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('50%')
      );
    });

    it('should log file sizes with formatted bytes', () => {
      logger.fileSize('File size:', 1024);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('File size:')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('1 KB')
      );
    });

    it('should log file sizes for different byte ranges', () => {
      // Test 0 bytes
      logger.fileSize('Empty file:', 0);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('0 B')
      );

      // Test megabytes
      logger.fileSize('Large file:', 1048576);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('1 MB')
      );

      // Test gigabytes
      logger.fileSize('Huge file:', 1073741824);
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('1 GB')
      );
    });

    it('should create and return timer function', () => {
      const timer = logger.startTimer();
      expect(typeof timer).toBe('function');
      
      // Wait a bit and call timer
      setTimeout(() => {
        const elapsed = timer();
        expect(typeof elapsed).toBe('number');
        expect(elapsed).toBeGreaterThan(0);
      }, 10);
    });
  });

  describe('message formatting', () => {
    it('should format messages with categories', () => {
      logger.info('test message', 'TEST_CATEGORY');
      expect(mockCore.info).toHaveBeenCalled();
    });

    it('should format messages without categories', () => {
      logger.info('test message');
      expect(mockCore.info).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle invalid log level gracefully', () => {
      // Test private log method with invalid level via reflection
      const loggerInstance = logger as any;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      loggerInstance.log('invalid_level', 'test message');
      expect(consoleSpy).toHaveBeenCalledWith('test message');
      
      consoleSpy.mockRestore();
    });
  });
});