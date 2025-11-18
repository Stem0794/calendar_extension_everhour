const path = require('path');
const fs = require('fs');

const userDataDir = path.join(__dirname, 'tmp-playwright-user');
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

module.exports = {
  testDir: path.join(__dirname, 'tests/e2e'),
  timeout: 60000,
  reporter: [['list']],
  use: {
    headless: true,
    browserName: 'chromium',
    launchOptions: {
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    }
  }
};
