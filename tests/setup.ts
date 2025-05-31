import { jest } from '@jest/globals';

// Mock @actions/core
export const mockCore = {
  getInput: jest.fn() as jest.MockedFunction<any>,
  setOutput: jest.fn() as jest.MockedFunction<any>,
  setFailed: jest.fn() as jest.MockedFunction<any>,
  saveState: jest.fn() as jest.MockedFunction<any>,
  getState: jest.fn() as jest.MockedFunction<any>,
  info: jest.fn() as jest.MockedFunction<any>,
  warning: jest.fn() as jest.MockedFunction<any>,
  error: jest.fn() as jest.MockedFunction<any>,
};

// Mock @actions/cache
export const mockCache = {
  restoreCache: jest.fn() as jest.MockedFunction<any>,
  saveCache: jest.fn() as jest.MockedFunction<any>,
  ValidationError: {
    name: 'ValidationError'
  },
  ReserveCacheError: {
    name: 'ReserveCacheError'
  },
};

// Setup mocks
jest.mock('@actions/core', () => mockCore);
jest.mock('@actions/cache', () => mockCache);

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Helper function to reset all mock implementations
export const resetMocks = (): void => {
  mockCore.getInput.mockReset();
  mockCore.setOutput.mockReset();
  mockCore.setFailed.mockReset();
  mockCore.saveState.mockReset();
  mockCore.getState.mockReset();
  mockCore.info.mockReset();
  mockCore.warning.mockReset();
  mockCore.error.mockReset();
  
  mockCache.restoreCache.mockReset();
  mockCache.saveCache.mockReset();
};