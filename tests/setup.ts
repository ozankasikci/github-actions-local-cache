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
  debug: jest.fn() as jest.MockedFunction<any>,
};

// Mock filesystem operations
export const mockFs = {
  existsSync: jest.fn() as jest.MockedFunction<any>,
  statSync: jest.fn() as jest.MockedFunction<any>,
  mkdirSync: jest.fn() as jest.MockedFunction<any>,
  unlinkSync: jest.fn() as jest.MockedFunction<any>,
  writeFileSync: jest.fn() as jest.MockedFunction<any>,
  readFileSync: jest.fn() as jest.MockedFunction<any>,
  rmSync: jest.fn() as jest.MockedFunction<any>,
  createReadStream: jest.fn() as jest.MockedFunction<any>,
  promises: {
    rename: jest.fn() as jest.MockedFunction<any>,
    unlink: jest.fn() as jest.MockedFunction<any>,
    writeFile: jest.fn() as jest.MockedFunction<any>,
    readFile: jest.fn() as jest.MockedFunction<any>,
  },
};

// Mock child_process
export const mockChildProcess = {
  exec: jest.fn() as jest.MockedFunction<any>,
};

// Mock crypto - return predictable hash for each key
export let hashCounter = 0;
export const mockCrypto = {
  createHash: jest.fn().mockImplementation(() => {
    const hashObject: any = {};
    hashObject.update = jest.fn().mockReturnValue(hashObject);
    hashObject.digest = jest.fn().mockImplementation((...args: any[]) => {
      hashCounter++;
      return `mocked-hash-${hashCounter}`;
    });
    return hashObject;
  }),
};

// Mock path
export const mockPath = {
  join: jest.fn((...parts: string[]) => parts.filter(p => p && p.length > 0).join('/')),
  basename: jest.fn((filePath: string) => filePath.split('/').pop() || ''),
  dirname: jest.fn((filePath: string) => {
    const parts = filePath.split('/');
    parts.pop(); // Remove the last part (file/folder name)
    const result = parts.join('/') || '/';
    // Handle edge case where relative path resolution adds '.'
    return result.endsWith('/.') ? result.slice(0, -2) : result;
  }),
  isAbsolute: jest.fn((path: string) => path.startsWith('/')),
  resolve: jest.fn((path: string) => {
    if (path.startsWith('/')) return path;
    // Clean up the relative path resolution
    const resolved = `/test/cwd/${path}`;
    return resolved.replace('/./', '/');
  }),
};

// Mock os
export const mockOs = {
  homedir: jest.fn(() => '/home/runner'),
  tmpdir: jest.fn(() => '/tmp'),
};

// Setup mocks
jest.mock('@actions/core', () => mockCore);
jest.mock('fs', () => mockFs);
jest.mock('child_process', () => mockChildProcess);
jest.mock('crypto', () => mockCrypto);
jest.mock('path', () => mockPath);
jest.mock('os', () => mockOs);

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
  mockFs.unlinkSync.mockReset();
  mockFs.writeFileSync.mockReset();
  mockFs.promises.rename.mockReset();
  mockFs.promises.unlink.mockReset();
  
  mockChildProcess.exec.mockReset();
  mockChildProcess.exec.mockImplementation((...args: any[]) => {
    const callback = args[args.length - 1];
    // Default implementation: simulate successful execution
    setImmediate(() => callback(null, { stdout: '', stderr: '' }));
    
    // Return a mock child process object with required methods for util.promisify
    return {
      on: jest.fn(),
      removeListener: jest.fn(),
      stdout: null,
      stderr: null,
      kill: jest.fn()
    };
  });
  
  // Reset crypto mock and restore implementation
  mockCrypto.createHash.mockReset();
  mockCrypto.createHash.mockImplementation(() => {
    const hashObject: any = {};
    hashObject.update = jest.fn().mockReturnValue(hashObject);
    hashObject.digest = jest.fn().mockImplementation((...args: any[]) => {
      hashCounter++;
      return `mocked-hash-${hashCounter}`;
    });
    return hashObject;
  });
  
  mockPath.join.mockReset();
  mockPath.join.mockImplementation((...parts: string[]) => parts.filter(p => p && p.length > 0).join('/'));
  mockPath.basename.mockReset();
  mockPath.basename.mockImplementation((filePath: string) => filePath.split('/').pop() || '');
  mockPath.dirname.mockReset();
  mockPath.dirname.mockImplementation((filePath: string) => {
    const parts = filePath.split('/');
    parts.pop(); // Remove the last part (file/folder name)
    const result = parts.join('/') || '/';
    // Handle edge case where relative path resolution adds '.'
    return result.endsWith('/.') ? result.slice(0, -2) : result;
  });
  mockPath.isAbsolute.mockReset();
  mockPath.isAbsolute.mockImplementation((path: string) => path.startsWith('/'));
  mockPath.resolve.mockReset();
  mockPath.resolve.mockImplementation((path: string) => {
    if (path.startsWith('/')) return path;
    // Clean up the relative path resolution
    const resolved = `/test/cwd/${path}`;
    return resolved.replace('/./', '/');
  });
  
  mockOs.homedir.mockReset();
  mockOs.homedir.mockReturnValue('/home/runner');
  
  hashCounter = 0; // Reset hash counter
};