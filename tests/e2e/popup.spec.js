const path = require('path');
const { test, expect, chromium } = require('@playwright/test');

const popupFile = 'file://' + path.join(__dirname, '..', '..', 'popup.html');

function stubChrome(events, projects, meetingProjectMap) {
  const store = { projects, meetingProjectMap, logs: [], summaryFilter: 'week', hoursFilter: 'week' };
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
  return {
    storage: {
      local: { _data: store, get: getVal, set: setVal, remove: () => {} }
    },
    runtime: { openOptionsPage: () => {} },
    tabs: {
      query: (_opts, cb) => cb([{ id: 1 }]),
      sendMessage: (_id, msg, cb) => {
        if (msg === 'get_week_events') cb(events);
        else cb([]);
      }
    }
  };
}

test('popup summary and hours tabs render data', async () => {
  const events = [
    { title: 'Planning', duration: 120, date: '2023-09-25', dayOfWeek: 1, comment: 'Notes' },
    { title: 'Planning', duration: 60, date: '2023-09-26', dayOfWeek: 2 }
  ];
  const projects = [{ name: 'Project A', color: '#ff0000' }];
  const meetingProjectMap = { Planning: 'Project A' };

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-crashpad', '--disable-features=Crashpad', '--disable-breakpad', '--enable-crash-reporter=0', '--single-process', '--no-zygote']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(stubChrome, events, projects, meetingProjectMap);
  await page.goto(popupFile);
  await page.evaluate(({ evts, projs, map }) => {
    if (!window.chrome) {
      const store = { projects: projs, meetingProjectMap: map, logs: [], summaryFilter: 'week', hoursFilter: 'week' };
      window.chrome = {
        storage: {
          local: {
            _data: store,
            get: (keys, cb) => {
              if (keys === null || keys === undefined) return cb({ ...store });
              if (Array.isArray(keys)) {
                const res = {};
                keys.forEach((k) => (res[k] = store[k]));
                return cb(res);
              }
              cb({ [keys]: store[keys] });
            },
            set: (obj, cb) => {
              Object.assign(store, obj);
              if (cb) cb();
            },
            remove: () => {}
          }
        },
        runtime: { openOptionsPage: () => {} },
        tabs: {
          query: (_opts, cb) => cb([{ id: 1 }]),
          sendMessage: (_id, msg, cb) => {
            if (msg === 'get_week_events') cb(evts);
            else cb([]);
          }
        }
      };
    }
    window.loadSummary && window.loadSummary();
  }, { evts: events, projs: projects, map: meetingProjectMap });

  // Summary tab shows meeting
  await expect(page.getByText('Planning')).toBeVisible({ timeout: 8000 });

  // Hours tab shows project totals
  await page.locator('.tab', { hasText: 'Project Hours' }).click();
  await expect(page.locator('#project-hours-table td', { hasText: 'Project A' }).first()).toBeVisible();

  await browser.close();
});
