const path = require('path');
const { test, expect } = require('@playwright/test');

const optionsFile = 'file://' + path.join(__dirname, '..', '..', 'options.html');

function stubChromeStorage() {
  const store = { projects: [], logs: [], meetingProjectMap: {} };
  const getVal = (keys, cb) => {
    if (keys === null || keys === undefined) {
      cb({ ...store });
      return;
    }
    if (Array.isArray(keys)) {
      const res = {};
      keys.forEach((k) => (res[k] = store[k]));
      cb(res);
      return;
    }
    cb({ [keys]: store[keys] });
  };
  const setVal = (obj, cb) => {
    Object.assign(store, obj);
    if (cb) cb();
  };
  const removeVal = (key, cb) => {
    delete store[key];
    if (cb) cb();
  };
  window.chrome = {
    storage: {
      local: { _data: store, get: getVal, set: setVal, remove: removeVal },
      onChanged: { addListener: () => {} }
    },
    runtime: { openOptionsPage: () => {} }
  };
}

test.describe('Extension smoke suite', () => {
  test('options page renders and basic flow works', async () => {
    const browser = await require('@playwright/test').chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-crashpad',
        '--disable-features=Crashpad',
        '--disable-breakpad',
        '--enable-crash-reporter=0',
        '--single-process',
        '--no-zygote'
      ]
    });
    const context = await browser.newContext({ userAgent: 'pw-smoke' });
    const page = await context.newPage();

    await page.addInitScript(stubChromeStorage);
    await page.goto(optionsFile);

    await expect(page.getByText('Projects')).toBeVisible();

    await page.fill('#new-project', 'Smoke Project');
    await page.click('#add-project');
    await expect(page.getByText('Smoke Project')).toBeVisible();

    await page.locator('.tab', { hasText: 'Everhour' }).click();
    await expect(page.locator('#everhour-token')).toBeVisible();

    await browser.close();
  });
});
