#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const rootDir = path.resolve(__dirname, '..');
const jsonReport = path.join(rootDir, 'test-report.json');
const pdfPath = path.join(rootDir, 'test-report.pdf');

if (fs.existsSync(jsonReport)) fs.unlinkSync(jsonReport);
if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

const result = spawnSync('npm', ['run', 'test'], {
  cwd: rootDir,
  env: { ...process.env, TEST_REPORT_JSON: jsonReport },
  stdio: 'inherit'
});

if (result.status !== 0) {
  console.error('Tests failed, aborting PDF creation.');
  process.exit(result.status || 1);
}

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
doc.text(`Command: npm run test`);
doc.text(`Status: ${reportData.status || 'unknown'}`);
doc.text(`Duration: ${reportData.durationMs || 0} ms`);
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

doc.end();
console.log(`PDF report written to ${pdfPath}`);
