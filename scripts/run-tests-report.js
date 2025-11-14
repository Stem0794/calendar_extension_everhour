#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const rootDir = path.resolve(__dirname, '..');
const jsonPath = path.join(rootDir, 'test-report.json');
const pdfPath = path.join(rootDir, 'test-report.pdf');

if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

const env = { ...process.env, TEST_REPORT_JSON: jsonPath };
const result = spawnSync('node', ['test.js'], {
  cwd: rootDir,
  env,
  encoding: 'utf8'
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error('Failed to execute tests:', result.error);
  process.exit(1);
}

if (!fs.existsSync(jsonPath)) {
  console.error('Test report JSON was not created.');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (err) {
  console.error('Could not parse JSON report:', err);
  process.exit(1);
}

const doc = new PDFDocument({ margin: 40, size: 'A4' });
doc.pipe(fs.createWriteStream(pdfPath));

doc.fontSize(20).text('Test Report', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
doc.text(`Command: node test.js`);
doc.text(`Status: ${report.status || 'unknown'}`);
doc.text(`Duration: ${report.durationMs || 0} ms`);
doc.moveDown();

doc.fontSize(14).text('Assertions', { underline: true });
doc.moveDown(0.25);
(report.assertions || []).forEach((item, idx) => {
  const status = item.status === 'passed' ? 'PASSED' : 'FAILED';
  doc.fontSize(10).text(`${idx + 1}. [${status}] ${item.name}`);
  if (item.error) {
    doc.fontSize(9).fillColor('red').text(`   Error: ${item.error}`);
    doc.fillColor('black');
  }
  doc.moveDown(0.15);
});

doc.moveDown();
doc.fontSize(14).text('Raw Output', { underline: true });
doc.moveDown(0.25);
const combined = `${result.stdout || ''}${result.stderr || ''}`.trim() || '(no output)';
doc.fontSize(9).text(combined);

doc.end();
console.log(`PDF report saved to ${pdfPath}`);
