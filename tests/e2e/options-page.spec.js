const fs = require('fs');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');

const optionsFile = 'file://' + path.join(__dirname, '..', '..', 'options.html');
const screenshotDir = path.join(__dirname, '..', '..', 'test-results', 'screenshots');
const enableE2E = process.env.PLAYWRIGHT_E2E === '1';
const userDataDir = path.join(__dirname, '..', '..', 'tmp-playwright-user');
const describe = enableE2E ? test.describe : test.describe.skip;

describe('Options page flows', () => {
  test('add, edit, and delete projects using UI', async () => {
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    let browser;
    let context;
    try {
      browser = await chromium.launch({
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
      context = await browser.newContext({ userAgent: 'playwright-test' });
    } catch (e) {
      console.error('Playwright launch failed:', e);
      test.skip(`Skipping options e2e: browser launch blocked (${e.message})`);
      return;
    }

    const page = await context.newPage();

    await page.addInitScript(() => {
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
    });

    await page.goto(optionsFile);

    // Add two projects in the same group
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

    await page.fill('#new-project', 'Alpha');
    await page.fill('#new-project-group', 'Team');
    await page.click('#add-project');

    await page.fill('#new-project', 'Beta');
    await page.fill('#new-project-group', 'Team');
    await page.click('#add-project');

    await expect(page.getByText('Alpha')).toBeVisible();
    await expect(page.getByText('Beta')).toBeVisible();
    await expect(page.getByText('Team')).toBeVisible(); // group header

    // Edit the first project
    await page.locator('.edit-btn').first().click();
    await page.fill('#rename-proj-0', 'Alpha Renamed');
    await page.fill('#edit-group-0', 'TeamX');
    await page.click('.save-btn');

    await expect(page.getByText('Alpha Renamed')).toBeVisible();
    await expect(page.getByText('TeamX')).toBeVisible();

    // Delete the remaining "Beta" project
    await page.locator('.delete-btn').last().click();
    await expect(page.getByText('Beta')).not.toBeVisible();

    const storedNames = await page.evaluate(() => window.chrome.storage.local._data.projects.map((p) => p.name));
    expect(storedNames).toEqual(['Alpha Renamed']);

    await page.screenshot({ path: path.join(screenshotDir, 'options-page.png'), fullPage: true });
    await browser.close();
  });
});
