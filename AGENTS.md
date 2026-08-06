# Repository Guidelines

## Project Structure & Module Organization

This repository is a Manifest V3 Chrome extension with source files at the root:

- `manifest.json` defines permissions, commands, the service worker, content script, and side panel.
- `content.js` parses Google Calendar Week View events.
- `popup.html`, `popup.js`, and `styles.css` implement the side-panel UI and Everhour logging flow.
- `options.html` and `options.js` manage projects, API configuration, backups, appearance, and activity.
- `background.js` handles commands and queued Everhour retries; `util.js` contains shared helpers.
- `tests/` contains Jest tests; `tests/e2e/` contains Playwright UI tests. User documentation lives in `wiki/`.
- `slack-bot/` is a separate Node helper. Do not include it in extension ZIPs.

## Build, Test, and Development Commands

- `npm install` installs development dependencies.
- `npm test` runs Jest unit tests and the legacy integration harness.
- `npm run test:legacy` runs `test.js` directly.
- `npm run test:e2e` runs Chromium-based side-panel and settings tests.
- `PLAYWRIGHT_E2E=1 npm run test:e2e` also enables the opt-in options CRUD flow.
- `npm run lint` checks JavaScript files with ESLint.
- `npm run format:check` verifies Prettier formatting; `npm run format` applies it.
- `npm run test:report` generates the PDF test report.

Load the repository folder through `chrome://extensions` using **Load unpacked** for manual testing. Keep Google Calendar in Week View.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single quotes in JavaScript, and Prettier defaults. Prefer `const`, small focused functions, and descriptive camelCase names. DOM IDs and CSS classes use kebab-case (`summary-filter`, `project-item`). Preserve existing Chrome storage keys and message names unless a migration is included.

## Testing Guidelines

Name Jest tests `*.test.js` and Playwright tests `*.spec.js`. Add regression coverage for parser changes, storage mutations, project assignment, Everhour requests, and responsive UI behavior. Stub Chrome APIs and external Everhour calls; tests must not contact live accounts. Run unit tests, E2E tests, lint, and formatting before submission.

## Commit & Pull Request Guidelines

Recent commits use concise imperative subjects such as `Fix project color accent` and `Refactor calendar extension data flow`. Keep each commit scoped to one logical change. Pull requests should explain user-visible behavior, list verification commands, link relevant issues, and include screenshots for side-panel or settings changes.

## Security & Release Packaging

Never commit Everhour tokens or exported user data. Release ZIPs should contain only runtime files referenced by `manifest.json`; exclude tests, docs, Git metadata, reports, and `slack-bot/`. Keep versions aligned in `manifest.json`, `package.json`, and `package-lock.json`.
