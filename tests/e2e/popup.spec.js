const fs = require('fs');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');

const popupFile = 'file://' + path.join(__dirname, '..', '..', 'popup.html');
const screenshotDir = path.join(__dirname, '..', '..', 'test-results', 'screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

const BROWSER_ARGS = [
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-crashpad',
  '--disable-features=Crashpad', '--disable-breakpad',
  '--enable-crash-reporter=0', '--single-process', '--no-zygote'
];

// Injects a window.chrome stub before the page scripts run.
// Receives a single config object so Playwright's addInitScript serialises it correctly.
function stubChrome({ events, projects, meetingProjectMap, extra }) {
  const store = Object.assign(
    { projects, meetingProjectMap, logs: [], summaryFilter: 'week', hoursFilter: 'week' },
    extra || {}
  );
  const getVal = (keys, cb) => {
    if (keys === null || keys === undefined) { cb({ ...store }); return; }
    if (Array.isArray(keys)) {
      const res = {};
      keys.forEach((k) => (res[k] = store[k]));
      cb(res);
      return;
    }
    cb({ [keys]: store[keys] });
  };
  // Support both callback-style and Promise-style (used by maybeShowOnboarding)
  const get = (keys, cb) => {
    if (typeof cb === 'function') return getVal(keys, cb);
    return new Promise(res => getVal(keys, res));
  };
  const setVal = (obj, cb) => { Object.assign(store, obj); if (cb) cb(); };
  window.chrome = {
    storage: {
      local: { _data: store, get, set: setVal, remove: () => {} },
      onChanged: { addListener: () => {} }
    },
    runtime: {
      openOptionsPage: () => {},
      lastError: undefined,
      onMessage: { addListener: () => {} }
    },
    tabs: {
      query: (_opts, cb) => cb([{ id: 1 }]),
      sendMessage: (_id, msg, cb) => { if (msg === 'get_week_events') cb(events); else cb([]); }
    }
  };
}

async function openPopup(events, projects, meetingProjectMap, extra) {
  const browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
  const page = await browser.newContext().then(ctx => ctx.newPage());
  await page.addInitScript(stubChrome, { events, projects, meetingProjectMap, extra: extra || {} });
  await page.goto(popupFile);
  return { browser, page };
}

// ---------------------------------------------------------------------------
// Existing test
// ---------------------------------------------------------------------------

test('popup summary and hours tabs render data', async () => {
  const events = [
    { title: 'Planning', duration: 120, date: '2023-09-25', dayOfWeek: 1, comment: 'Notes' },
    { title: 'Planning', duration: 60,  date: '2023-09-26', dayOfWeek: 2 }
  ];
  const projects = [{ name: 'Project A', color: '#ff0000' }];
  const meetingProjectMap = { Planning: 'Project A' };

  const { browser, page } = await openPopup(events, projects, meetingProjectMap);

  // Summary tab shows meeting
  await expect(page.getByText('Planning')).toBeVisible({ timeout: 8000 });

  // Hours tab shows project totals with percentage
  await page.locator('.tab', { hasText: 'Project Hours' }).click();
  await expect(page.locator('#project-hours-table td', { hasText: 'Project A' }).first()).toBeVisible();
  await expect(page.locator('#project-hours-table th', { hasText: '%' }).first()).toBeVisible();
  await expect(page.locator('#project-hours-table td', { hasText: '100%' }).first()).toBeVisible();

  await page.screenshot({ path: path.join(screenshotDir, 'popup-summary-hours.png'), fullPage: true });
  await browser.close();
});

// ---------------------------------------------------------------------------
// Per-day filter — Project Hours tab
// ---------------------------------------------------------------------------

test('project hours per-day filter shows only that day and correct percentage', async () => {
  const events = [
    { title: 'Standup',  duration: 30,  date: '2023-09-25', dayOfWeek: 1 }, // Monday
    { title: 'Planning', duration: 120, date: '2023-09-25', dayOfWeek: 1 }, // Monday
    { title: 'Retro',    duration: 60,  date: '2023-09-26', dayOfWeek: 2 }, // Tuesday
  ];
  const projects = [
    { name: 'Project A', color: '#ff0000' },
    { name: 'Project B', color: '#0000ff' },
  ];
  const meetingProjectMap = { Standup: 'Project A', Planning: 'Project A', Retro: 'Project B' };

  const { browser, page } = await openPopup(events, projects, meetingProjectMap);

  await page.locator('.tab', { hasText: 'Project Hours' }).click();
  // Switch to Monday filter
  await page.selectOption('#hours-filter', 'monday');

  // Monday: Project A = 30+120 = 150 min = 2.5 h, 100% of the day
  await expect(page.locator('#project-hours-table td', { hasText: 'Project A' }).first()).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#project-hours-table td', { hasText: '100%' }).first()).toBeVisible();

  // Tuesday's project must not appear
  await expect(page.locator('#project-hours-table td', { hasText: 'Project B' })).not.toBeVisible();

  await browser.close();
});

test('project hours per-day filter shows empty message when no events', async () => {
  const events = [
    { title: 'Standup', duration: 30, date: '2023-09-25', dayOfWeek: 1 }, // Monday only
  ];
  const projects = [{ name: 'Project A', color: '#ff0000' }];
  const meetingProjectMap = { Standup: 'Project A' };

  const { browser, page } = await openPopup(events, projects, meetingProjectMap);

  await page.locator('.tab', { hasText: 'Project Hours' }).click();
  // Switch to Wednesday (no events)
  await page.selectOption('#hours-filter', 'wednesday');

  await expect(page.locator('#project-hours-table')).toContainText('No project hours for Wednesday', { timeout: 6000 });

  await browser.close();
});

// ---------------------------------------------------------------------------
// Summary tab — filter by day
// ---------------------------------------------------------------------------

test('summary tab filters meetings by selected day', async () => {
  const events = [
    { title: 'Monday Meeting',  duration: 60,  date: '2023-09-25', dayOfWeek: 1 },
    { title: 'Tuesday Meeting', duration: 90,  date: '2023-09-26', dayOfWeek: 2 },
  ];
  const projects = [{ name: 'Project A', color: '#ff0000' }];
  const meetingProjectMap = { 'Monday Meeting': 'Project A', 'Tuesday Meeting': 'Project A' };

  const { browser, page } = await openPopup(events, projects, meetingProjectMap);

  // Default week view: both meetings visible
  await expect(page.locator('#meeting-list td', { hasText: 'Monday Meeting' }).first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#meeting-list td', { hasText: 'Tuesday Meeting' }).first()).toBeVisible();

  // Switch to Tuesday filter
  await page.selectOption('#summary-filter', 'tuesday');

  await expect(page.locator('#meeting-list td', { hasText: 'Tuesday Meeting' }).first()).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#meeting-list td', { hasText: 'Monday Meeting' })).not.toBeVisible();
  // Day label is shown
  await expect(page.locator('#meeting-list')).toContainText('Tuesday');

  await browser.close();
});

test('summary tab shows empty message for day with no meetings', async () => {
  const events = [
    { title: 'Standup', duration: 30, date: '2023-09-25', dayOfWeek: 1 }, // Monday only
  ];
  const projects = [{ name: 'Project A', color: '#ff0000' }];
  const meetingProjectMap = { Standup: 'Project A' };

  const { browser, page } = await openPopup(events, projects, meetingProjectMap);

  await page.selectOption('#summary-filter', 'thursday');

  await expect(page.locator('#meeting-list')).toContainText('No meetings for Thursday', { timeout: 6000 });

  await browser.close();
});

// ---------------------------------------------------------------------------
// Meeting-to-project assignment
// ---------------------------------------------------------------------------

test('assigning a project to a meeting saves it to storage', async () => {
  const events = [
    { title: 'Design Review', duration: 60, date: '2023-09-25', dayOfWeek: 1 },
  ];
  const projects = [{ name: 'Project X', color: '#00ff00' }];
  const meetingProjectMap = {}; // unassigned

  const { browser, page } = await openPopup(events, projects, meetingProjectMap);

  // Wait for summary table to render
  await expect(page.locator('#meeting-list td', { hasText: 'Design Review' }).first()).toBeVisible({ timeout: 8000 });

  // The row's select dropdown should be unassigned ('-')
  const sel = page.locator('#meeting-list select').first();
  await expect(sel).toHaveValue('');

  // Assign Project X
  await sel.selectOption('Project X');

  // Verify storage was updated
  const stored = await page.evaluate(() => window.chrome.storage.local._data.meetingProjectMap);
  expect(stored['Design Review']).toBe('Project X');

  await browser.close();
});

// ---------------------------------------------------------------------------
// Everhour log — no token
// ---------------------------------------------------------------------------

test('log all button shows error toast when no Everhour token is set', async () => {
  const events = [
    { title: 'Standup', duration: 30, date: '2023-09-25', dayOfWeek: 1 },
  ];
  const projects = [{ name: 'Project A', color: '#ff0000', taskId: 'task-1' }];
  const meetingProjectMap = { Standup: 'Project A' };
  // No everhourToken in store

  const { browser, page } = await openPopup(events, projects, meetingProjectMap);

  await expect(page.locator('#meeting-list td', { hasText: 'Standup' }).first()).toBeVisible({ timeout: 8000 });

  await page.click('#log-all-btn');

  // Toast with error message should appear
  await expect(page.locator('#toast-container')).toContainText('Please set your Everhour token in Settings', { timeout: 5000 });

  // Button should be re-enabled
  await expect(page.locator('#log-all-btn')).toBeEnabled({ timeout: 3000 });

  await browser.close();
});

// ---------------------------------------------------------------------------
// Sync check
// ---------------------------------------------------------------------------

test('sync check shows no-token error when token is missing', async () => {
  const events = [
    { title: 'Standup', duration: 30, date: '2023-09-25', dayOfWeek: 1 },
  ];
  const projects = [{ name: 'Project A', color: '#ff0000' }];
  const meetingProjectMap = { Standup: 'Project A' };

  const { browser, page } = await openPopup(events, projects, meetingProjectMap);

  await expect(page.locator('#meeting-list td', { hasText: 'Standup' }).first()).toBeVisible({ timeout: 8000 });
  await page.click('#sync-check-btn');

  await expect(page.locator('#sync-check-status')).toContainText('Set Everhour token in Settings first', { timeout: 5000 });
  await expect(page.locator('#sync-check-status')).toHaveClass(/error/);

  await browser.close();
});

test('sync check shows X/Y logged count without making API calls when none logged', async () => {
  const events = [
    { title: 'Standup',  duration: 30,  date: '2023-09-25', dayOfWeek: 1 },
    { title: 'Planning', duration: 120, date: '2023-09-25', dayOfWeek: 1 },
  ];
  const projects = [{ name: 'Project A', color: '#ff0000' }];
  const meetingProjectMap = { Standup: 'Project A', Planning: 'Project A' };
  // everhourToken set but nothing logged yet (everhourEntries empty)

  const { browser, page } = await openPopup(events, projects, meetingProjectMap, { everhourToken: 'tok-123' });

  await expect(page.locator('#meeting-list td', { hasText: 'Standup' }).first()).toBeVisible({ timeout: 8000 });

  // Intercept Everhour API — should not be called since nothing is logged
  let apiCalled = false;
  await page.route('**/api.everhour.com/**', () => { apiCalled = true; });

  await page.click('#sync-check-btn');

  // 0 of 2 meetings logged → shows error state
  await expect(page.locator('#sync-check-status')).toContainText('0/2 entries logged', { timeout: 5000 });
  await expect(page.locator('#sync-check-status')).toContainText('not yet sent');
  expect(apiCalled).toBe(false);

  await browser.close();
});

test('sync check shows correct X/Y when all meetings logged and verified', async () => {
  const events = [
    { title: 'Standup',  duration: 30,  date: '2023-09-25', dayOfWeek: 1 },
    { title: 'Planning', duration: 120, date: '2023-09-25', dayOfWeek: 1 },
  ];
  const projects = [{ name: 'Project A', color: '#ff0000' }];
  const meetingProjectMap = { Standup: 'Project A', Planning: 'Project A' };
  // Both meetings already logged — weekKey format: "Title|YYYY-MM-DD" (Monday of the week)
  const everhourEntries = {
    'Standup|2023-09-25':  ['entry-1'],
    'Planning|2023-09-25': ['entry-2'],
  };

  const { browser, page } = await openPopup(events, projects, meetingProjectMap, {
    everhourToken: 'tok-123',
    everhourEntries
  });

  await expect(page.locator('#meeting-list td', { hasText: 'Standup' }).first()).toBeVisible({ timeout: 8000 });

  // Stub Everhour API to return 200 for all entry IDs
  await page.route('**/api.everhour.com/time/**', route => route.fulfill({ status: 200, body: '{}' }));

  await page.click('#sync-check-btn');

  await expect(page.locator('#sync-check-status')).toContainText('Sync OK: 2/2 entries logged', { timeout: 5000 });
  await expect(page.locator('#sync-check-status')).toHaveClass(/success/);

  await browser.close();
});

// ---------------------------------------------------------------------------
// Dark mode
// ---------------------------------------------------------------------------

test('dark mode is applied on load when stored preference is true', async () => {
  const events = [];
  const projects = [];
  const meetingProjectMap = {};

  const { browser, page } = await openPopup(events, projects, meetingProjectMap, { darkMode: true });

  // initDarkMode() reads storage and adds 'dark' class to body
  await expect(page.locator('body')).toHaveClass(/dark/, { timeout: 5000 });

  await browser.close();
});

test('dark mode is not applied when stored preference is false', async () => {
  const events = [];
  const projects = [];
  const meetingProjectMap = {};

  const { browser, page } = await openPopup(events, projects, meetingProjectMap, { darkMode: false });

  // body should NOT have the 'dark' class
  const cls = await page.locator('body').getAttribute('class');
  expect((cls || '').split(' ')).not.toContain('dark');

  await browser.close();
});
