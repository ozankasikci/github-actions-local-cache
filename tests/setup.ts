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

// Mock filesystem operations
export const mockFs = {
  existsSync: jest.fn() as jest.MockedFunction<any>,
  statSync: jest.fn() as jest.MockedFunction<any>,
  mkdirSync: jest.fn() as jest.MockedFunction<any>,
};

// Mock child_process
export const mockChildProcess = {
  exec: jest.fn() as jest.MockedFunction<any>,
};

// Mock crypto
let hashCounter = 0;
export const mockCrypto = {
  createHash: jest.fn(() => {
    hashCounter++;
    return {
      update: jest.fn(() => ({
        digest: jest.fn(() => `mocked-hash-${hashCounter}`)
      }))
    };
  }) as jest.MockedFunction<any>,
};

// Mock path
export const mockPath = {
  join: jest.fn((...parts: string[]) => parts.join('/')),
};

// Setup mocks
jest.mock('@actions/core', () => mockCore);
jest.mock('fs', () => mockFs);
jest.mock('child_process', () => mockChildProcess);
jest.mock('crypto', () => mockCrypto);
jest.mock('path', () => mockPath);

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  hashCounter = 0; // Reset hash counter
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
  
  mockFs.existsSync.mockReset();
  mockFs.statSync.mockReset();
  mockFs.mkdirSync.mockReset();
  
  mockChildProcess.exec.mockReset();
  mockCrypto.createHash.mockReset();
  mockPath.join.mockReset();
  
  hashCounter = 0; // Reset hash counter
};