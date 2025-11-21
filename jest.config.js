/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'github-client.test.ts', // Octokit ESM mocking issues
    'conflict-resolver.test.ts', // Inquirer ESM mocking issues
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/cli.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 52,
      branches: 47,
      functions: 60,
      statements: 52,
    },
  },
  coverageDirectory: 'coverage',
  verbose: true,
  transformIgnorePatterns: [
    'node_modules/(?!(inquirer|chalk|ora)/)',
  ],
};
