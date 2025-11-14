## Copilot / AI agent instructions — Calendar to Project Hours

Purpose: help an AI coding agent quickly understand this Chrome extension and make safe, focused code changes.

- Big picture
  - This is a Chrome extension (Manifest V3) that reads events from Google Calendar (Week View) via a content script and exposes them to the popup UI for tagging and sending to Everhour.
  - Key pieces:
    - `manifest.json` — extension entry, `content_scripts` match `https://calendar.google.com/*`.
    - `content.js` — parses event chips on Calendar Week View and exposes parsed events via message: listens for `chrome.runtime.onMessage` and responds to `'get_week_events'` with an array of event objects.
    - `popup.html` + `popup.js` — popup UI: displays summaries, maps meetings->projects, and calls Everhour API (`sendToEverhour`).
    - `options.html` + `options.js` — settings page: CRUD for `projects`, grouping, export/import (excludes API token).
    - `util.js` — shared helpers (storage wrapper, color helpers, CSV quoting, getWeekKey).

- Data shapes and storage conventions (discoverable)
  - `parseEventsFromWeekView()` (in `content.js`) returns objects like:
    - `{ title, comment, duration, date, dayOfWeek, dayName, startTime }` where `date` is `YYYY-MM-DD` and `duration` is in minutes.
  - Persistent keys stored in `chrome.storage.local` (via the Promise wrapper in `util.js`):
    - `projects` — array of { name, color, keywords[], taskId, group }
    - `meetingProjectMap` — { [meetingTitle]: projectName }
    - `everhourEntries` — { [weekKey]: [entryIds] }
    - `everhourToken` — API token (sensitive; never export)
    - UI keys: `activeTab`, `summaryFilter`, `hoursFilter`, `onboarded`, `logs`

- Integration points & external APIs
  - Everhour: host permissions in `manifest.json` for `https://api.everhour.com/tasks/*/time`. `popup.js` posts to `/tasks/{id}/time` and deletes `/time/{id}`. API key header: `X-Api-Key`.
  - Message bridge: popup -> content uses `chrome.tabs.sendMessage(..., 'get_week_events', cb)` and content responds to `'get_week_events'`.

- Project-specific patterns and conventions
  - Storage wrapper: `storage.get/set/remove` in `util.js` returns Promises; prefer these across files.
  - UI state is persisted (active tab and filters), restored on load (`restoreState()` in `popup.js`).
  - Project auto-linking: keywords are lowercased and matched against meeting titles; when a project is auto-detected the map is persisted.
  - Multi-language parsing: `content.js` contains EN/FR month names and regex patterns to support French/English calendar text.

- Quick developer workflows (how to run/debug)
  - Unit/sanity tests & syntax checks: `node test.js` (this runs simple VM-based tests and `node -c` syntax checks for key scripts).
  - Load in Chrome for integration debugging: enable Developer Mode → Load unpacked → select repo folder. Open `https://calendar.google.com` in Week View to test content parsing.
  - Debugging tips:
    - To debug content script, open DevTools on the Google Calendar tab (Week View) and inspect console logs in that tab.
    - To debug popup/options, open the extension popup or open the HTML directly via `chrome-extension://<EXT_ID>/popup.html` or `options.html` (use chrome://extensions to get ID).

- Safe change notes / things to watch for
  - The content parser returns `duration` in minutes; the Everhour call in `popup.js` uses `Math.round(duration * 60)` when posting `time` — review this carefully if changing units.
  - The repo intentionally excludes the API token during export; import/export explicitly deletes `everhourToken`.

- Where to look for examples
  - event parsing: `content.js` -> `parseEventsFromWeekView()`
  - Everhour integration: `popup.js` -> `sendToEverhour()` and `removeFromEverhour()`
  - Storage + UI patterns: `util.js`, `popup.js`, `options.js`
  - Tests and quick validation: `test.js` (vm-based tests that show expected parsing behavior and storage interactions)

## Contributor checklist (quick start)

- Read the big picture: `manifest.json`, `content.js`, `popup.js`, `options.js`, `util.js`, `README.md`, and `wiki/Home.md`.
- Reproduce locally: Load the repo as an unpacked extension in Chrome (Developer Mode → Load unpacked) and open `https://calendar.google.com` in Week View.
- Run quick sanity tests (requires Node.js):

```bash
node test.js
```

- When changing `content.js` parsing:
  - Add tests in `test.js` that cover EN/FR month names, 24/12h formats, overnight meetings, and unknown-month fallbacks.
  - Validate on a live Google Calendar Week View tab (open DevTools on that tab to see content-script logs).
- When changing `popup.js` or `options.js` storage/UI behavior:
  - Use the `storage` Promise wrapper from `util.js` (`get/set/remove`) for consistency.
  - If renaming a project, update `meetingProjectMap` to preserve mappings (see save logic in `options.js`).
- Everhour and exports:
  - Never include `everhourToken` in exported JSON — `exportSettings()` intentionally deletes it.
  - Keep HTTP calls to Everhour using the `X-Api-Key` header.
- Time units:
  - `content.js` returns `duration` in minutes; `popup.js` posts `time: Math.round(duration * 60)`. Re-check the arithmetic if units change.
- Logging & audit:
  - Use `addLog()` (defined in `options.js`) to append human-readable entries to `logs` for actions like send/remove/import/export.
- UI state:
  - Persist and restore `activeTab`, `summaryFilter`, and `hoursFilter` (see `restoreState()` in `popup.js`).
- Tests & PRs:
  - Add at least one `test.js` entry for any new parsing or storage behavior.
  - Ensure `node test.js` passes locally before opening a PR.
- Safety:
  - Do not commit Everhour API tokens or other secrets.

## Examples (copyable)

These short examples are intended to make common edits quick and safe.

- Parsing examples (from `content.js`)

  Input (Calendar chip text):

  - "from 9:00 to 10:00 Team Sync"
    - Parsed object: `{ title: 'Team Sync', comment: '', duration: 60, date: '2023-09-25', dayOfWeek: 1, dayName: 'Monday', startTime: '09:00' }`
  - "de 13h00 à 14h30 Réunion + Notes"
    - Parsed object: `{ title: 'Réunion', comment: 'Notes', duration: 90, date: '2023-09-26', dayOfWeek: 2, dayName: 'Tuesday', startTime: '13:00' }`
  - "5 aug 2023 from 9:00 to 10:00 Meeting"
    - Parsed object: `{ title: 'Meeting', duration: 60, date: '2023-08-05', ... }` (fallback uses Date.parse for non-EN/FR month names)

- Sample unit test to add to `test.js` for a new parsing case

  ```javascript
  // add near other parseSamples in test.js
  let p = parseSample('from 7:30am to 8:15am Standup');
  assert.deepStrictEqual(p, { start: '7:30am', end: '8:15am', title: 'Standup', duration: 45, comment: '' });
  ```

- Example: ensure exported settings never include the Everhour token (`options.js`)

  When writing an import/export change, follow the pattern in `exportSettings()`:

  ```js
  const data = await storage.get(null);
  delete data.everhourToken; // must remove sensitive token
  // then stringify and download
  ```

- Small example diff (JS) to preserve `meetingProjectMap` when renaming a project

  If you change how projects are renamed in `options.js`, keep the mapping update pattern:

  ```diff
  - // naive rename
  - projects[idx].name = name;
  + // preserve meeting->project map
  + const oldName = projects[idx].name;
  + projects[idx].name = name;
  + Object.keys(meetingProjectMap).forEach(t => { if (meetingProjectMap[t] === oldName) meetingProjectMap[t] = name; });
