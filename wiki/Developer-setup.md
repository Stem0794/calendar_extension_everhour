# Developer Setup

This page summarizes the tooling you can use to verify the extension before submitting a change.

> Requirements: Node.js 18+ (for Jest/Playwright) and npm.

## Install dependencies

```bash
npm install
```

## Linting & formatting

- `npm run lint` – ESLint (with Chrome globals) checks the JavaScript sources.
- `npm run lint:fix` – attempts to automatically fix lint errors.
- `npm run format` – runs Prettier on JS/HTML/CSS/JSON files.

## Tests

- `npm test` – runs the Jest suite (content parser unit tests + the legacy `test.js` harness).
- `npm run test:legacy` – executes `node test.js` directly, matching the original workflow.
- `npm run test:report` – runs `npm test` and generates `test-report.pdf` (via `pdfkit`) listing every assertion and its status.
- `npm run test:e2e` – launches the Playwright test runner. The included spec is a placeholder, but the command is ready for future extension UI tests.

> Tip: run `npx playwright install` once before `npm run test:e2e` so Playwright downloads the required browser binaries.

## Suggested workflow

1. Make your code changes.
2. Run `npm run lint` and `npm test`.
3. (Optional) `npm run test:report` to produce a PDF artifact for sharing.
4. (Optional) `npm run test:e2e` as you add Playwright coverage.
5. Commit and open a pull request.
