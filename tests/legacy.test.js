const { execSync } = require('child_process');

describe('Legacy extension tests', () => {
  test('node test.js succeeds', () => {
    execSync('node test.js', { stdio: 'inherit' });
  });
});
