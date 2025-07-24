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

// Additional regex samples
p = parseSample('from 1pm to 2:30pm Demo');
assert.deepStrictEqual(p, { start:'1pm', end:'2:30pm', title:'Demo', duration:90, comment:'' });

p = parseSample('de 13h00 à 14h30 Rendez-vous + Plan');
assert.deepStrictEqual(p, { start:'13h00 ', end:'14h30 ', title:'Rendez-vous', duration:90, comment:'Plan' });

// --- Everhour integration logic ---
const alerts = [];
global.alert = msg => alerts.push(msg);

const storage = {
  data: { everhourToken:'t', projects:[{ name:'Proj', taskId:123 }] },
  async get(key){ return { [key]: this.data[key] }; }
};

let calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  return { ok:true, json: async () => ({ id: 'id'+calls.length }) };
};

async function sendToEverhour(title, eventsArr, assignedProject, btn){
  const { everhourToken='' } = await storage.get('everhourToken');
  if(!everhourToken){ alert('Please set your Everhour token'); return; }
  if(!assignedProject){ alert('Select a project for this meeting'); return; }
  const { projects=[] } = await storage.get('projects');
  const taskId = projects.find(p=>p.name===assignedProject)?.taskId;
  if(!taskId){ alert('Project is missing Everhour task ID'); return; }
  const eventsToSend = Array.isArray(eventsArr) ? eventsArr.filter(ev=>ev.title===title) : [];
  if(!eventsToSend.length){ alert('Could not find event details'); return; }
  btn.disabled = true;
  const prev = btn.dataset.sent==='true'?'✓':'+';
  btn.textContent = '⌛';
  const entryIds = [];
  try{
    for(const ev of eventsToSend){
      const { date, duration, comment='' } = ev;
      const res = await fetch(`https://api.everhour.com/tasks/${taskId}/time`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'X-Api-Key':everhourToken },
        body: JSON.stringify({ task:taskId, date, time:Math.round(duration*60), comment })
      });
      if(!res.ok) throw new Error('Request failed');
      const data = await res.json().catch(()=>null);
      if(data && data.id) entryIds.push(data.id);
    }
    btn.dataset.sent='true';
    btn.dataset.entryIds = JSON.stringify(entryIds);
    btn.textContent='✓';
    btn.disabled=false;
  }catch(e){
    btn.textContent='Error';
    setTimeout(()=>{ btn.textContent=prev; btn.disabled=false; },2000);
  }
}

async function removeFromEverhour(btn){
  const { everhourToken='' } = await storage.get('everhourToken');
  if(!everhourToken){ alert('Please set your Everhour token'); return; }
  const ids = JSON.parse(btn.dataset.entryIds || '[]');
  if(!ids.length){ btn.dataset.sent='false'; btn.textContent='+'; return; }
  btn.disabled=true;
  const prev = btn.textContent;
  btn.textContent='⌛';
  try{
    for(const id of ids){
      const res = await fetch(`https://api.everhour.com/time/${id}`, { method:'DELETE', headers:{'X-Api-Key':everhourToken} });
      if(!res.ok) throw new Error('Request failed');
    }
    btn.dataset.sent='false';
    btn.dataset.entryIds='';
    btn.textContent='+';
    btn.disabled=false;
  }catch(e){
    btn.textContent='Error';
    setTimeout(()=>{ btn.textContent=prev; btn.disabled=false; },2000);
  }
}

const btn = { disabled:false, textContent:'+', dataset:{} };
const events = [{ title:'Meeting', date:'2025-01-01', duration:1, comment:'Test' }];

(async () => {
  await sendToEverhour('Meeting', events, 'Proj', btn);
  assert.strictEqual(btn.dataset.sent, 'true');
  assert.strictEqual(btn.textContent, '✓');
  assert.deepStrictEqual(JSON.parse(btn.dataset.entryIds), ['id1']);
  assert.strictEqual(calls[0].url, 'https://api.everhour.com/tasks/123/time');
  assert.strictEqual(JSON.parse(calls[0].opts.body).comment, 'Test');

  calls = [];
  await removeFromEverhour(btn);
  assert.strictEqual(btn.dataset.sent, 'false');
  assert.strictEqual(btn.textContent, '+');
  assert.strictEqual(btn.dataset.entryIds, '');
  assert.strictEqual(calls[0].url, 'https://api.everhour.com/time/id1');
  assert.strictEqual(calls[0].opts.method, 'DELETE');

  console.log('All tests passed.');
})();
