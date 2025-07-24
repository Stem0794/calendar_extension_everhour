const assert = require('assert');
const cp = require('child_process');

// Syntax checks for popup and content scripts
cp.execSync('node -c popup.js');
cp.execSync('node -c content.js');

// Utility functions from popup.js
function quoteField(value) {
  const str = String(value ?? '');
  if(/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function addAlpha(hex, alpha) {
  if(!hex) return '';
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Regex utilities from regex_examples.js
const regex = /(?:from|de)?\s*(\d{1,2}(?:(?::|\s*h\s*)\d{2})?\s*(?:[ap]m)?)\s*(?:à|to|[-–])\s*(\d{1,2}(?:(?::|\s*h\s*)\d{2})?\s*(?:[ap]m)?),?\s*(.+)/i;
function toMinutes(str) {
  const m = str.trim().toLowerCase().match(/(\d{1,2})(?:(?:\:|\s*h\s*)(\d{2}))?\s*(am|pm)?/);
  if(!m) return 0;
  let h = +m[1];
  const mins = m[2] ? +m[2] : 0;
  const ap = m[3];
  if(ap){
    if(ap === 'pm' && h !== 12) h += 12;
    if(ap === 'am' && h === 12) h = 0;
  }
  return h*60 + mins;
}
function parseSample(text) {
  const m = text.match(regex);
  if(!m) return null;
  let [, start, end, title] = m;
  let comment = '';
  const plusIdx = title.indexOf('+');
  if(plusIdx !== -1){
    comment = title.slice(plusIdx + 1).trim();
    title = title.slice(0, plusIdx).trim();
  }
  const duration = toMinutes(end) - toMinutes(start);
  return { start, end, title, duration, comment };
}

// Tests for quoteField
assert.strictEqual(quoteField('hello'), 'hello');
assert.strictEqual(quoteField('he"llo'), '"he""llo"');
assert.strictEqual(quoteField('hello, world'), '"hello, world"');
assert.strictEqual(quoteField('line\nbreak'), '"line\nbreak"');

// Tests for addAlpha
assert.strictEqual(addAlpha('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)');
assert.strictEqual(addAlpha('#00ff00', 1), 'rgba(0, 255, 0, 1)');

// Regex parsing tests

let p = parseSample('from 9:00 to 10:00 Meeting');
assert.deepStrictEqual(p, { start:'9:00 ', end:'10:00 ', title:'Meeting', duration:60, comment:'' });

p = parseSample('de 9h00 à 10h00 Réunion');
assert.deepStrictEqual(p, { start:'9h00 ', end:'10h00 ', title:'Réunion', duration:60, comment:'' });

p = parseSample('from 9:00 to 10:00 Meeting + Notes');
assert.deepStrictEqual(p, { start:'9:00 ', end:'10:00 ', title:'Meeting', duration:60, comment:'Notes' });

console.log('All tests passed.');
