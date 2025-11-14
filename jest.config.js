module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  roots: ['<rootDir>/tests'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  verbose: true
};
