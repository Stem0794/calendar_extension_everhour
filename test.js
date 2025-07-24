const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const vm = require('vm');

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

// --- parseEventsFromWeekView tests ---
function createContentDoc(html){
  const chips=[]; let idx=0; const open='<div data-eventchip>';
  while((idx=html.indexOf(open,idx))!==-1){
    const start=idx+open.length;
    const end=html.indexOf('</div></div>',start);
    const inner=html.slice(start,end+6);
    const m=inner.match(/<div class="XuJrye">([\s\S]*?)<\/div>/);
    const text=m?m[1].trim():'';
    chips.push({querySelector:s=>s=='.XuJrye'?{textContent:text}:null});
    idx=end+12;
  }
  return {querySelectorAll:s=>s=='[data-eventchip]'?chips:[]};
}

const contentCode = fs.readFileSync('content.js','utf8');
let sandbox = {chrome:{runtime:{onMessage:{addListener(){}}}},console};
vm.createContext(sandbox);vm.runInContext(contentCode,sandbox);
sandbox.document = createContentDoc('<div data-eventchip><div class="XuJrye">Mon 25 September 2023 from 9:00 to 10:00 Meeting A</div></div>');
let ev = sandbox.parseEventsFromWeekView();
assert.strictEqual(ev.length,1);
assert.strictEqual(ev[0].title,'Meeting A');
assert.strictEqual(ev[0].date,'2023-09-25');

sandbox.document = createContentDoc('<div data-eventchip><div class="XuJrye">mardi 26 septembre 2023 de 14h00 à 15h00 Réunion B + Note</div></div>');
ev = sandbox.parseEventsFromWeekView();
assert.strictEqual(ev[0].comment,'Note');
assert.strictEqual(ev[0].startTime,'14:00');

// --- popup.js getWeekKey and dropdown tests ---
class Element{constructor(t){this.tagName=t;this.children=[];this.innerHTML='';this.value='';this.style={};this.dataset={};this.classList={add(){},remove(){}};}appendChild(c){this.children.push(c);}}
class Select extends Element{constructor(){super('select');this.options=[];this.selectedIndex=0;}set innerHTML(h){this._innerHTML=h;this.options=[];const r=/<option[^>]*>(.*?)<\/option>/gi;let m;while((m=r.exec(h))){const val=(m[0].match(/value="(.*?)"/)||[])[1]||'';this.options.push({value:val,text:m[1]});}}get innerHTML(){return this._innerHTML;}}
const popupCode = fs.readFileSync('popup.js','utf8');
function setupPopup(events){
  const document={
    elements:{},
    createElement:t=>t==='select'?new Select():new Element(t),
    getElementById(id){return this.elements[id]||(this.elements[id]=new Element('div'));},
    querySelectorAll(){return {forEach(){}}},
    querySelector(){return null}
  };
  const chrome={
    tabs:{query:(o,cb)=>cb([{id:1}]), sendMessage:(id,msg,cb)=>{cb(events);}},
    storage:{local:{
      get:(key,cb)=>{const data={projects:[{name:'P1',color:'#ccc'}],everhourEntries:{},meetingProjectMap:{},onboarded:true};const res=typeof key==='string'?{[key]:data[key]}:key.reduce((o,k)=>{o[k]=data[k];return o;},{}); if(cb) cb(res); else return Promise.resolve(res);},
      set:(o,cb)=>{cb&&cb(); return Promise.resolve();},
      remove:(k,cb)=>{cb&&cb(); return Promise.resolve();}
    }},
    runtime:{openOptionsPage(){}, lastError:null}
  };
  const sb={console,chrome,document};
  vm.createContext(sb);vm.runInContext(popupCode,sb);
  return {sb,document};
}

// Tests for unknown month handling in content.js
const fs = require('fs');
const vm = require('vm');

function runParse(text){
  const code = fs.readFileSync('content.js', 'utf8');
  const ctx = {
    document: { querySelectorAll: () => [{ querySelector: () => ({ textContent: text }) }] },
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    console
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.parseEventsFromWeekView();
}

let eventsParsed = runParse('5 aug 2023 from 9:00 to 10:00 Meeting');
assert.strictEqual(eventsParsed.length, 1);
assert.strictEqual(eventsParsed[0].date, '2023-08-05');

eventsParsed = runParse('5 agosto 2023 from 9:00 to 10:00 Meeting');
assert.strictEqual(eventsParsed.length, 0);

// --- Everhour integration logic ---
const alerts = [];
global.alert = msg => alerts.push(msg);

const storage = {
  data: { everhourToken:'t', projects:[{ name:'Proj', taskId:123 }], everhourEntries:{} },
  async get(key){ return { [key]: this.data[key] }; },
  async set(obj){ Object.assign(this.data, obj); }
};

let calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  return { ok:true, json: async () => ({ id: 'id'+calls.length }) };
};

async function addLog() {}

async function sendToEverhour(title, eventsArr, assignedProject, btn, key){
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
    if(key){
      storage.data.everhourEntries[key] = entryIds;
    }
  }catch(e){
    btn.textContent='Error';
    setTimeout(()=>{ btn.textContent=prev; btn.disabled=false; },2000);
  }
}

async function removeFromEverhour(addBtn, remBtn){
  const { everhourToken='' } = await storage.get('everhourToken');
  if(!everhourToken){ alert('Please set your Everhour token'); return; }
  const key = addBtn.dataset.weekKey || '';
  let ids = JSON.parse(addBtn.dataset.entryIds || '[]');
  if(!ids.length && key){
    ids = storage.data.everhourEntries[key] || [];
  }
  if(!ids.length){
    addBtn.dataset.sent='false';
    addBtn.textContent='+';
    if(key) delete storage.data.everhourEntries[key];
    remBtn.textContent='✓';
    setTimeout(()=>{ remBtn.textContent='×'; },3000);
    return;
  }
  addBtn.disabled=true;
  remBtn.disabled=true;
  const prev = remBtn.textContent;
  remBtn.textContent='⌛';
  try{
    for(const id of ids){
      const res = await fetch(`https://api.everhour.com/time/${id}`, { method:'DELETE', headers:{'X-Api-Key':everhourToken} });
      if(!res.ok) throw new Error('Request failed');
    }
    addBtn.dataset.sent='false';
    addBtn.dataset.entryIds='';
    addBtn.textContent='+';
    addBtn.disabled=false;
    remBtn.textContent='✓';
    setTimeout(()=>{ remBtn.textContent='×'; remBtn.disabled=false; },3000);
    if(key) delete storage.data.everhourEntries[key];
  }catch(e){
    remBtn.textContent='Error';
    setTimeout(()=>{ remBtn.textContent=prev; addBtn.disabled=false; remBtn.disabled=false; },2000);
  }
}

const btn = { disabled:false, textContent:'+', dataset:{} };
const rem = { disabled:false, textContent:'×' };
const events = [{ title:'Meeting', date:'2025-01-01', duration:1, comment:'Test' }];
const weekKey = 'Meeting|2024-12-30';
btn.dataset.weekKey = weekKey;

(async () => {
  // popup.js dropdown and getWeekKey tests
  let env = setupPopup([{title:'M',duration:60,date:'2023-09-25',dayOfWeek:1,dayName:'Mon'}]);
  env.document.getElementById('summary-filter').value = 'week';
  await new Promise(r=>{env.sb.chrome.tabs.sendMessage=(id,msg,cb)=>{cb([{title:'M',duration:60,date:'2023-09-25',dayOfWeek:1,dayName:'Mon'}]);setTimeout(r,0);}; env.sb.loadSummary();});
  const tbl = env.document.getElementById('meeting-list').children[0];
  const sel = tbl.children[1].children[0].children[0];
  assert.deepStrictEqual(sel.options.map(o=>o.text), ['-','P1']);
  assert.strictEqual(env.sb.getWeekKey('Test',[{date:'2023-09-27'}]), 'Test|2023-09-25');

  await sendToEverhour('Meeting', events, 'Proj', btn, weekKey);
  assert.strictEqual(btn.dataset.sent, 'true');
  assert.strictEqual(btn.textContent, '✓');
  assert.deepStrictEqual(JSON.parse(btn.dataset.entryIds), ['id1']);
  assert.strictEqual(calls[0].url, 'https://api.everhour.com/tasks/123/time');
  assert.strictEqual(JSON.parse(calls[0].opts.body).comment, 'Test');
  assert.deepStrictEqual(storage.data.everhourEntries[weekKey], ['id1']);

  calls = [];
  await removeFromEverhour(btn, rem);
  assert.strictEqual(btn.dataset.sent, 'false');
  assert.strictEqual(btn.textContent, '+');
  assert.strictEqual(rem.textContent, '✓');
  assert.strictEqual(btn.dataset.entryIds, '');
  assert.deepStrictEqual(storage.data.everhourEntries[weekKey], undefined);
  assert.strictEqual(calls[0].url, 'https://api.everhour.com/time/id1');
  assert.strictEqual(calls[0].opts.method, 'DELETE');

  console.log('All tests passed.');
})();
