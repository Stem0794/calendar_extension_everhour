const path = require('path');

module.exports = {
  testDir: path.join(__dirname, 'tests/e2e'),
  timeout: 60000,
  reporter: [['list']],
  use: {
    headless: true
  }
};
