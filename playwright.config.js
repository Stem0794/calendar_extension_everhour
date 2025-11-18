const path = require('path');

module.exports = {
  testDir: path.join(__dirname, 'tests/e2e'),
  timeout: 60000,
  reporter: [['list']],
  use: {
    headless: false,
    browserName: 'chromium',
    launchOptions: {
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    }
  }
};
