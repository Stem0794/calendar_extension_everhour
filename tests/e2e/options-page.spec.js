const path = require('path');
const { test, expect } = require('@playwright/test');

const optionsFile = 'file://' + path.join(__dirname, '..', '..', 'options.html');
const enableE2E = process.env.PLAYWRIGHT_E2E === '1';

test.describe(enableE2E ? 'Options page flows' : test.skip('Set PLAYWRIGHT_E2E=1 to run options page e2e'), () => {
  test('add, edit, and delete projects using UI', async ({ page }) => {
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
  });
});
