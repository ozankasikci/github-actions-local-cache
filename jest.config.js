module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testMatch: ['**/tests/**/*.test.ts'],
  testRunner: 'jest-circus/runner',
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  verbose: true,
  collectCoverage: true,
  collectCoverageFrom: [
    'lib/**/*.ts',
    '!lib/**/*.test.ts',
    '!lib/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 69,
      lines: 50,
      statements: 50
    }
  }
};