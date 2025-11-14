const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const vm = require('vm');

const TEST_START = Date.now();
const ASSERTION_RESULTS = [];
const ASSERT_METHODS = ['ok', 'strictEqual', 'deepStrictEqual'];

function fmtArg(arg) {
  if (typeof arg === 'string') return `"${arg.length > 80 ? arg.slice(0, 77) + '...' : arg}"`;
  if (Array.isArray(arg)) return `[${arg.slice(0, 3).map(fmtArg).join(', ')}${arg.length > 3 ? ', ...' : ''}]`;
  if (typeof arg === 'object' && arg !== null) {
    try {
      const json = JSON.stringify(arg);
      return json.length > 80 ? json.slice(0, 77) + '...' : json;
    } catch {
      return '[Object]';
    }
  }
  return String(arg);
}

ASSERT_METHODS.forEach(method => {
  const original = assert[method];
  assert[method] = function patchedAssert(...args) {
    const detail = `assert.${method}(${args.map(fmtArg).join(', ')})`;
    try {
      const result = original.apply(assert, args);
      ASSERTION_RESULTS.push({ name: detail, status: 'passed' });
      return result;
    } catch (err) {
      ASSERTION_RESULTS.push({ name: detail, status: 'failed', error: err.message });
      throw err;
    }
  };
});

process.on('exit', (code) => {
  if (!process.env.TEST_REPORT_JSON) return;
  const payload = {
    status: code === 0 ? 'passed' : 'failed',
    durationMs: Date.now() - TEST_START,
    assertions: ASSERTION_RESULTS
  };
  try {
    fs.writeFileSync(process.env.TEST_REPORT_JSON, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('Could not write test report JSON:', err);
  }
});

// Syntax checks for popup, content and util scripts
cp.execSync('node -c popup.js');
cp.execSync('node -c content.js');
cp.execSync('node -c util.js');

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
class Element{
  constructor(tag, doc=null){
    this.tagName = tag;
    this.children = [];
    this._innerHTML = '';
    this.value = '';
    this.textContent = '';
    this.style = {};
    this.dataset = {};
    this.classList = { add(){}, remove(){} };
    this.disabled = false;
    this.onclick = null;
    this._doc = doc;
    Object.defineProperty(this, 'id', {
      configurable: true,
      get: () => this._id || '',
      set: val => {
        this._id = val;
        if (this._doc) this._doc.elements[val] = this;
      }
    });
    Object.defineProperty(this, 'innerHTML', {
      configurable: true,
      get: () => this._innerHTML,
      set: val => {
        this._innerHTML = val;
        if (val === '') this.children = [];
      }
    });
  }
  appendChild(child){
    this.children.push(child);
    return child;
  }
  querySelectorAll(selector){
    const results = [];
    const targetClasses = (selector || '').split('.').filter(Boolean);
    const walk = node => {
      if(!node || !node.children) return;
      node.children.forEach(child => {
        const cls = (child.className || '').split(/\s+/);
        if(targetClasses.length && targetClasses.every(c => cls.includes(c))) results.push(child);
        walk(child);
      });
    };
    walk(this);
    return results;
  }
  querySelector(selector){
    return this.querySelectorAll(selector)[0] || null;
  }
  click(){
    if (typeof this.onclick === 'function') this.onclick();
    this.clicked = true;
  }
}

class Select extends Element{
  constructor(doc=null){
    super('select', doc);
    this.options = [];
    this.selectedIndex = 0;
  }
  appendChild(child){
    super.appendChild(child);
    if(child.tagName === 'option'){
      const option = { value: child.value || '', text: child.textContent || '' };
      this.options.push(option);
      if(child.selected) this.selectedIndex = this.options.length - 1;
    }
    return child;
  }
}

function createStubDocument(){
  const doc = {
    elements: {},
    createElement(tag){
      return tag === 'select' ? new Select(doc) : new Element(tag, doc);
    },
    getElementById(id){
      if(!this.elements[id]){
        const el = new Element('div', doc);
        el._id = id;
        this.elements[id] = el;
      }
      return this.elements[id];
    },
    querySelectorAll(){ return { forEach(){} }; },
    querySelector(){ return null; }
  };
  return doc;
}
const popupCode = fs.readFileSync('popup.js','utf8');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function createStorageAPI(data){
  const resolveKeys = keys => {
    if (keys === null || keys === undefined) return { ...data };
    if (Array.isArray(keys)) {
      return keys.reduce((acc, key) => { acc[key] = data[key]; return acc; }, {});
    }
    if (typeof keys === 'object') {
      return Object.keys(keys).reduce((acc, key) => {
        acc[key] = data[key] ?? keys[key];
        return acc;
      }, {});
    }
    return { [keys]: data[keys] };
  };
  return {
    get(keys, cb){
      const res = resolveKeys(keys);
      if (cb) cb(res);
      else return Promise.resolve(res);
    },
    set(obj, cb){
      Object.assign(data, obj);
      cb && cb();
      return Promise.resolve();
    },
    remove(key, cb){
      (Array.isArray(key) ? key : [key]).forEach(k => delete data[k]);
      cb && cb();
      return Promise.resolve();
    }
  };
}

function setupPopup(events, overrides = {}){
  const document = createStubDocument();
  ['summary-filter','hours-filter','meeting-list','project-hours-table','onboarding-tip','open-options'].forEach(id => document.getElementById(id));
  const data = Object.assign({
    projects: [{ name: 'P1', color: '#ccc', keywords: [] }],
    everhourEntries: {},
    meetingProjectMap: {},
    onboarded: true,
    activeTab: 'summary',
    summaryFilter: 'week',
    hoursFilter: 'week',
    logs: []
  }, overrides);
  let currentEvents = events;
  const storageAPI = createStorageAPI(data);
  const chrome = {
    tabs: {
      query: (opts, cb) => cb([{ id: 1 }]),
      sendMessage: (tabId, msg, cb) => cb(currentEvents)
    },
    storage: {
      local: storageAPI,
      onChanged: { addListener(){} }
    },
    runtime: { openOptionsPage(){}, lastError: null }
  };
  const sb = { console, chrome, document, setTimeout, clearTimeout };
  vm.createContext(sb); vm.runInContext(popupCode, sb);
  return {
    sb,
    document,
    chrome,
    data,
    setEvents(next){ currentEvents = next; }
  };
}

async function renderSummary(env, events, filter = 'week'){
  env.document.getElementById('summary-filter').value = filter;
  await new Promise(resolve => {
    env.sb.chrome.tabs.sendMessage = (id, msg, cb) => { cb(events); resolve(); };
    env.sb.loadSummary();
  });
  await flush();
}

async function renderProjectHoursView(env, events, filter = 'week'){
  env.document.getElementById('hours-filter').value = filter;
  await new Promise(resolve => {
    env.sb.chrome.tabs.sendMessage = (id, msg, cb) => { cb(events); resolve(); };
    env.sb.loadProjectHours();
  });
  await flush();
}

// Tests for unknown month handling in content.js

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

const complexHtml = `
<div data-eventchip><div class="XuJrye">Mon 25 September 2023 from 9:00 to 10:30 Weekly Sync + Notes</div></div>
<div data-eventchip><div class="XuJrye">from 12:00 to 13:00 Lunch Break</div></div>
<div data-eventchip><div class="XuJrye">lundi 2 octobre 2023 de 22h00 à 1h00 Projet Nuit</div></div>
`;
let ctx = { document: createContentDoc(complexHtml), chrome:{ runtime:{ onMessage:{ addListener(){} } } }, console };
vm.createContext(ctx); vm.runInContext(contentCode, ctx);
let fixtures = ctx.parseEventsFromWeekView();
assert.strictEqual(fixtures.length, 2);
const nightly = fixtures.find(ev => ev.title === 'Projet Nuit');
assert.ok(nightly);
assert.strictEqual(nightly.duration, 180);
assert.strictEqual(fixtures[0].comment, 'Notes');

const unknownMonthHtml = `<div data-eventchip><div class="XuJrye">5 agosto 2023 from 9:00 to 10:00 Meeting</div></div>`;
ctx = { document: createContentDoc(unknownMonthHtml), chrome:{ runtime:{ onMessage:{ addListener(){} } } }, console };
vm.createContext(ctx); vm.runInContext(contentCode, ctx);
assert.strictEqual(ctx.parseEventsFromWeekView().length, 0);

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

function findFirstSelect(node){
  if(!node || !node.children) return null;
  for(const child of node.children){
    if(child.tagName === 'select') return child;
    const found = findFirstSelect(child);
    if(found) return found;
  }
  return null;
}

function findChildByClass(node, className){
  if(!node || !node.children) return null;
  for(const child of node.children){
    const cls = (child.className || '').split(/\s+/);
    if(cls.includes(className)) return child;
  }
  return null;
}

function getProjectRows(list){
  return list.children.filter(child => child.className !== 'group-header');
}

function extractSelect(html, id){
  const re = new RegExp(`<select[^>]*id="${id}"[\\s\\S]*?<\\/select>`, 'i');
  const match = html.match(re);
  return match ? match[0] : '';
}

function expectOptions(selectHtml, values){
  values.forEach(val => {
    const re = new RegExp(`<option[^>]*value="${val}"[^>]*>`, 'i');
    assert.ok(re.test(selectHtml), `Missing option ${val}`);
  });
}

function expectTab(html, tabName){
  const re = new RegExp(`<div[^>]*class="[^"]*tab[^"]*"[^>]*data-tab="${tabName}"`, 'i');
  assert.ok(re.test(html), `Missing tab ${tabName}`);
}

(async () => {
  // popup.js dropdown, auto-linking, and filters
  const baseEvents = [{title:'M',duration:60,date:'2023-09-25',dayOfWeek:1,dayName:'Mon'}];
  let env = setupPopup(baseEvents);
  await renderSummary(env, baseEvents, 'week');
  const tbl = env.document.getElementById('meeting-list').children[0];
  const sel = findFirstSelect(tbl);
  assert.deepStrictEqual(sel.options.map(o=>o.text), ['-','P1']);
  assert.strictEqual(env.sb.getWeekKey('Test',[{date:'2023-09-27'}]), 'Test|2023-09-25');

  const summaryEvents = [
    { title:'Weekly Sync', duration:120, date:'2023-09-25', dayOfWeek:1, dayName:'Monday' },
    { title:'Tuesday Standup', duration:60, date:'2023-09-26', dayOfWeek:2, dayName:'Tuesday' }
  ];
  const autoEnv = setupPopup(summaryEvents, {
    projects: [
      { name:'Alpha', color:'#eee', keywords:['sync'] },
      { name:'Beta', color:'#ddd', keywords:['standup'] }
    ],
    meetingProjectMap: { 'Tuesday Standup':'Beta' }
  });
  await renderSummary(autoEnv, summaryEvents, 'week');
  assert.strictEqual(autoEnv.data.meetingProjectMap['Weekly Sync'], 'Alpha');

  await renderSummary(autoEnv, summaryEvents, 'monday');
  const mondayList = autoEnv.document.getElementById('meeting-list');
  const mondayLabel = mondayList.children[0];
  const mondayTable = mondayList.children[1];
  assert.strictEqual(mondayLabel.textContent, 'Monday');
  assert.strictEqual(mondayTable.children[1].children[0].textContent, 'Weekly Sync');

  await renderProjectHoursView(autoEnv, summaryEvents, 'tuesday');
  const hoursContainer = autoEnv.document.getElementById('project-hours-table');
  const dayLabel = hoursContainer.children[0];
  const hoursRow = hoursContainer.children[1].children[1];
  assert.strictEqual(dayLabel.textContent, 'Tuesday');
  assert.strictEqual(hoursRow.children[0].textContent, 'Beta');

  await sendToEverhour('Meeting', events, 'Proj', btn, weekKey);
  assert.strictEqual(btn.dataset.sent, 'true');
  assert.strictEqual(btn.textContent, '✓');
  assert.deepStrictEqual(JSON.parse(btn.dataset.entryIds), ['id1']);
  assert.strictEqual(calls[0].url, 'https://api.everhour.com/tasks/123/time');
  assert.strictEqual(JSON.parse(calls[0].opts.body).comment, 'Test');
  assert.deepStrictEqual(storage.data.everhourEntries[weekKey], ['id1']);

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok:false, json: async () => ({}) });
  const originalSetTimeout = global.setTimeout;
  let failureReset = false;
  global.setTimeout = fn => { failureReset = true; fn(); return 0; };
  btn.dataset.sent = 'false';
  btn.textContent = '+';
  calls = [];
  await sendToEverhour('Meeting', events, 'Proj', btn, weekKey);
  assert.ok(failureReset);
  assert.strictEqual(btn.textContent, '+');
  assert.deepStrictEqual(storage.data.everhourEntries[weekKey], ['id1']);
  global.fetch = originalFetch;
  global.setTimeout = originalSetTimeout;

  calls = [];
  await removeFromEverhour(btn, rem);
  assert.strictEqual(btn.dataset.sent, 'false');
  assert.strictEqual(btn.textContent, '+');
  assert.strictEqual(rem.textContent, '✓');
  assert.strictEqual(btn.dataset.entryIds, '');
  assert.deepStrictEqual(storage.data.everhourEntries[weekKey], undefined);
  assert.strictEqual(calls[0].url, 'https://api.everhour.com/time/id1');
  assert.strictEqual(calls[0].opts.method, 'DELETE');

  // --- options.js export/import and grouping tests ---
  const optionsCode = fs.readFileSync('options.js', 'utf8');
  const optData = {
    everhourToken: 'tok',
    projects: [
      { name: 'A', group: 'G1' },
      { name: 'B', group: 'G1' },
      { name: 'C', group: 'G2' }
    ],
    logs: [],
    meetingProjectMap: { Meeting: 'A' }
  };
  const doc2 = createStubDocument();
  ['project-list','log-list','everhour-token','token-status','save-token','new-project','new-project-color','new-project-keywords','new-project-task','new-project-group','add-project','import-file','download-link','export-settings','import-settings'].forEach(id => doc2.getElementById(id));
  doc2.getElementById('import-file').files = [];
  let blobStr = '';
  const BlobCls = class { constructor(parts) { blobStr = parts[0]; } };
  let createdUrl = '';
  const URLapi = { createObjectURL: () => { createdUrl = 'blob:url'; return createdUrl; }, revokeObjectURL() { } };
  const chrome2 = {
    storage: {
      local: createStorageAPI(optData),
      onChanged: { addListener() { } }
    }
  };
  const ctx2 = {
    console,
    document: doc2,
    chrome: chrome2,
    storage: optData,
    Blob: BlobCls,
    URL: URLapi,
    setTimeout: fn => fn(),
    alert
  };
  vm.createContext(ctx2); vm.runInContext(optionsCode, ctx2);

  await ctx2.exportSettings();
  assert.strictEqual(doc2.getElementById('download-link').download, 'settings_export.json');
  assert.strictEqual(createdUrl, 'blob:url');
  assert.deepStrictEqual(JSON.parse(blobStr), {
    projects: [
      { name: 'A', group: 'G1' },
      { name: 'B', group: 'G1' },
      { name: 'C', group: 'G2' }
    ],
    logs: [],
    meetingProjectMap: { Meeting: 'A' }
  });
  assert.ok(optData.logs.some(l => l.msg === 'Exported settings'));

  const fileInput = doc2.getElementById('import-file');
  fileInput.files = [{ text: async () => JSON.stringify({ projects: [{ name: 'D', group: 'G2' }], logs: ['x'], meetingProjectMap: { Meeting: 'D' }, everhourToken: 'x' }) }];
  fileInput.value = 'f';
  await ctx2.importSettings();
  const importedProjects = optData.projects.map(p => ({ name: p.name, group: p.group }));
  assert.strictEqual(JSON.stringify(importedProjects), JSON.stringify([{ name: 'D', group: 'G2' }]));
  assert.strictEqual(optData.logs[0], 'x');
  assert.strictEqual(JSON.stringify(optData.meetingProjectMap), JSON.stringify({ Meeting: 'D' }));
  assert.strictEqual(fileInput.value, '');
  assert.ok(optData.logs.some(l => l.msg === 'Imported settings'));

  doc2.getElementById('project-list').children = [];
  await chrome2.storage.local.set({ projects: [ { name: 'A1', group: 'G1' }, { name: 'A2', group: 'G1' }, { name: 'B1', group: 'G2' } ] });
  await ctx2.renderProjectList();
  const kids = doc2.getElementById('project-list').children;
  assert.strictEqual(kids.length, 5);
  assert.strictEqual(kids[0].textContent, 'G1');
  assert.strictEqual(kids[3].textContent, 'G2');

  await chrome2.storage.local.set({ projects: [{ name: '<img src=x>', group: '' }], meetingProjectMap: {} });
  await ctx2.renderProjectList();
  let projectRows = getProjectRows(doc2.getElementById('project-list'));
  assert.strictEqual(projectRows[0].children[1].textContent, '<img src=x>');

  await chrome2.storage.local.set({ projects: [{ name: 'Legacy', group: '' }], meetingProjectMap: { Weekly: 'Legacy' } });
  await ctx2.renderProjectList();
  projectRows = getProjectRows(doc2.getElementById('project-list'));
  await findChildByClass(projectRows[0], 'edit-btn').onclick();
  doc2.getElementById('rename-proj-0').value = 'Modern';
  await findChildByClass(getProjectRows(doc2.getElementById('project-list'))[0], 'save-btn').onclick();
  assert.strictEqual(optData.projects[0].name, 'Modern');
  assert.strictEqual(optData.meetingProjectMap.Weekly, 'Modern');

  await chrome2.storage.local.set({ projects: [{ name: 'Temp', group: '' }], meetingProjectMap: { Weekly: 'Temp' } });
  await ctx2.renderProjectList();
  await findChildByClass(getProjectRows(doc2.getElementById('project-list'))[0], 'delete-btn').onclick();
  await flush();
  assert.strictEqual(optData.projects.length, 0);
  assert.deepStrictEqual(optData.meetingProjectMap, {});

  await chrome2.storage.local.set({ projects: [{ name: 'One', group: '' }, { name: 'Two', group: '' }, { name: 'Three', group: '' }] });
  await ctx2.renderProjectList();
  const firstRow = getProjectRows(doc2.getElementById('project-list'))[0];
  const moveDownBtn = firstRow.children.find(child => (child.className || '').includes('move-btn down'));
  await moveDownBtn.onclick();
  await flush();
  assert.strictEqual(optData.projects.map(p => p.name).join(','), 'Two,One,Three');

  const popupHtml = fs.readFileSync('popup.html', 'utf8');
  expectTab(popupHtml, 'summary');
  expectTab(popupHtml, 'hours');
  assert.ok(/id="meeting-list"/.test(popupHtml));
  assert.ok(/id="project-hours-table"/.test(popupHtml));
  assert.ok(/id="open-options"/.test(popupHtml));
  const summarySelect = extractSelect(popupHtml, 'summary-filter');
  expectOptions(summarySelect, ['week','monday','tuesday','wednesday','thursday','friday']);
  const hoursSelect = extractSelect(popupHtml, 'hours-filter');
  expectOptions(hoursSelect, ['week','monday','tuesday','wednesday','thursday','friday']);

  const optionsHtml = fs.readFileSync('options.html', 'utf8');
  expectTab(optionsHtml, 'projects');
  expectTab(optionsHtml, 'everhour');
  expectTab(optionsHtml, 'activity');
  assert.ok(/id="project-list"/.test(optionsHtml));
  assert.ok(/id="everhour-token"/.test(optionsHtml));
  assert.ok(/id="log-list"/.test(optionsHtml));
  ['new-project','new-project-color','new-project-keywords','new-project-task','new-project-group'].forEach(id => {
    assert.ok(new RegExp(`id="${id}"`).test(optionsHtml), `Missing ${id}`);
  });

  console.log('All tests passed.');
})();
