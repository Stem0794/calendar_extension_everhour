#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const rootDir = path.resolve(__dirname, '..');
const jsonReport = path.join(rootDir, 'test-report.json');
const pdfPath = path.join(rootDir, 'test-report.pdf');
const screenshotDir = path.join(rootDir, 'test-results', 'screenshots');

if (fs.existsSync(jsonReport)) fs.unlinkSync(jsonReport);
if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

const run = (cmd, args, extraEnv = {}) => {
  const started = Date.now();
  const res = spawnSync(cmd, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit'
  });
  return { status: res.status || 0, durationMs: Date.now() - started };
};

const jestRun = run('npm', ['run', 'test'], { TEST_REPORT_JSON: jsonReport });
if (jestRun.status !== 0) {
  console.error('Tests failed, aborting PDF creation.');
  process.exit(jestRun.status || 1);
}

const e2eRun = run('npm', ['run', 'test:e2e'], { PLAYWRIGHT_E2E: '1' });

if (!fs.existsSync(jsonReport)) {
  console.error('Test report JSON missing, cannot create PDF.');
  process.exit(1);
}

let reportData;
try {
  reportData = JSON.parse(fs.readFileSync(jsonReport, 'utf8'));
} catch (err) {
  console.error('Failed to parse JSON report:', err);
  process.exit(1);
}

const doc = new PDFDocument({ margin: 40, size: 'A4' });
doc.pipe(fs.createWriteStream(pdfPath));

const now = new Date();
doc.fontSize(20).text('Test Report', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(10).text(`Generated: ${now.toISOString()}`);
doc.text(`Commands: npm run test; npm run test:e2e (PLAYWRIGHT_E2E=1)`);
doc.text(`Status: ${reportData.status || 'unknown'}`);
doc.text(`Jest Duration: ${reportData.durationMs || 0} ms`);
doc.text(`Playwright Status: ${e2eRun.status === 0 ? 'passed' : 'failed'}`);
doc.text(`Playwright Duration: ${e2eRun.durationMs} ms`);
doc.moveDown();

doc.fontSize(14).text('Assertions', { underline: true });
doc.moveDown(0.25);
(reportData.assertions || []).forEach((item, idx) => {
  const statusLabel = item.status === 'passed' ? 'PASSED' : 'FAILED';
  doc.fontSize(10).text(`${idx + 1}. [${statusLabel}] ${item.name}`);
  if (item.error) {
    doc.fontSize(9).fillColor('red').text(`   Error: ${item.error}`);
    doc.fillColor('black');
  }
  doc.moveDown(0.15);
});

doc.moveDown();
doc.fontSize(14).text('Notes', { underline: true });
doc.fontSize(9).text('Raw CLI output is available in the terminal logs.');

if (e2eRun.status !== 0) {
  doc.moveDown();
  doc.fontSize(10).fillColor('red').text('Playwright e2e run failed.');
  doc.fillColor('black');
}

// Screenshots (if any)
if (fs.existsSync(screenshotDir)) {
  const shots = fs.readdirSync(screenshotDir).filter(f => f.endsWith('.png'));
  if (shots.length) {
    doc.addPage();
    doc.fontSize(14).text('Playwright Screenshots', { underline: true });
    doc.moveDown(0.5);
    shots.forEach((file, idx) => {
      const label = `${idx + 1}. ${file}`;
      doc.fontSize(10).text(label);
      try {
        doc.image(path.join(screenshotDir, file), { fit: [500, 400], align: 'center' });
      } catch (e) {
        doc.fontSize(9).fillColor('red').text(`Could not embed ${file}: ${e.message}`);
        doc.fillColor('black');
      }
      doc.moveDown(0.5);
    });
  }
}

doc.end();
console.log(`PDF report written to ${pdfPath}`);
