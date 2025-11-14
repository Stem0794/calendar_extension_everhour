// --- CONSTANTS ---
const DAYS_EN = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAYS_LABEL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const JS_DAY_IDX = {monday:1, tuesday:2, wednesday:3, thursday:4, friday:5};

// Quote CSV field per RFC4180
function quoteField(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Convert HEX color to rgba with given alpha
function addAlpha(hex, alpha) {
  if (!hex) return '';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getWeekKey(title, events) {
  if (!Array.isArray(events) || !events.length) return title || '';
  const d = new Date(events[0].date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const week = monday.toISOString().slice(0, 10);
  return `${title}|${week}`;
}

// --- ONBOARDING ---
async function maybeShowOnboarding() {
  const { onboarded } = await chrome.storage.local.get("onboarded");
  const tip = document.getElementById("onboarding-tip");
  if (!onboarded) {
    tip.style.display = "block";
    tip.onclick = () => {
      tip.style.display = "none";
      chrome.storage.local.set({ onboarded: true });
    };
  } else {
    tip.style.display = "none";
  }
}
maybeShowOnboarding();

// --- RESTORE LAST STATE ---
async function restoreState() {
  const { activeTab = 'summary', summaryFilter = 'week', hoursFilter = 'week' } = await storage.get(['activeTab', 'summaryFilter', 'hoursFilter']);
  const sumSel = document.getElementById('summary-filter');
  const hoursSel = document.getElementById('hours-filter');
  if (sumSel) sumSel.value = summaryFilter;
  if (hoursSel) hoursSel.value = hoursFilter;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const tabBtn = document.querySelector(`.tab[data-tab="${activeTab}"]`) || document.querySelector('.tab');
  const tabContent = document.getElementById(activeTab) || document.querySelector('.tab-content');
  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) tabContent.classList.add('active');
  if (activeTab === 'hours') loadProjectHours();
  if (activeTab === 'summary') loadSummary();
}

// --- TABS ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = async () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
    await storage.set({ activeTab: tab.dataset.tab });
    if (tab.dataset.tab === "hours") loadProjectHours();
    if (tab.dataset.tab === "summary") loadSummary();
  };
});

// --- STORAGE UTIL ---
const storage = {
  get: keys => new Promise(res => chrome.storage.local.get(keys, res)),
  set: obj => new Promise(res => chrome.storage.local.set(obj, res)),
  remove: key => new Promise(res => chrome.storage.local.remove(key, res)),
};

function createProjectSelect(projects, assignedProject) {
  const sel = document.createElement('select');
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '-';
  sel.appendChild(emptyOpt);
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (p.color) opt.style.background = p.color;
    if (p.name === assignedProject) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.title = sel.options[sel.selectedIndex]?.text || '';
  return sel;
}

// Settings page button
document.getElementById('open-options').onclick = () => {
  chrome.runtime.openOptionsPage();
};


// --- PROJECT MAP ---
async function getMeetingToProjectMap() {
  return (await storage.get('meetingProjectMap')).meetingProjectMap || {};
}
async function setMeetingToProjectMap(map) {
  await storage.set({ meetingProjectMap: map });
}

// --- EVERHOUR INTEGRATION ---

async function sendToEverhour(title, eventsArr, assignedProject, btn, key) {
  const { everhourToken = '' } = await storage.get('everhourToken');
  if (!everhourToken) {
    alert('Please set your Everhour token');
    return;
  }
  if (!assignedProject) {
    alert('Select a project for this meeting');
    return;
  }
  const { projects = [] } = await storage.get('projects');
  const taskId = projects.find(p => p.name === assignedProject)?.taskId;
  if (!taskId) {
    alert('Project is missing Everhour task ID');
    return;
  }
  const eventsToSend = Array.isArray(eventsArr)
    ? eventsArr.filter(ev => ev.title === title)
    : [];
  if (!eventsToSend.length) {
    alert('Could not find event details');
    return;
  }
  btn.disabled = true;
  const prev = btn.dataset.sent === 'true' ? '✓' : '+';
  btn.textContent = '⌛';
  const entryIds = [];
  try {
    for (const ev of eventsToSend) {
      const { date, duration, comment = '' } = ev;
      const res = await fetch(`https://api.everhour.com/tasks/${taskId}/time`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': everhourToken
        },
        body: JSON.stringify({
          task: taskId,
          date,
          time: Math.round(duration * 60),
          comment
        })
      });
      if (!res.ok) {
        throw new Error('Request failed');
      }
      const data = await res.json().catch(() => null);
      if (data && data.id) entryIds.push(data.id);
    }
    btn.dataset.sent = 'true';
    btn.dataset.entryIds = JSON.stringify(entryIds);
    btn.textContent = '✓';
    btn.disabled = false;
    if (key) {
      const { everhourEntries = {} } = await storage.get('everhourEntries');
      everhourEntries[key] = entryIds;
      await storage.set({ everhourEntries });
    }
    await addLog(`Sent "${title}" to Everhour`);
  } catch (e) {
    console.error(e);
    btn.textContent = 'Error';
    setTimeout(() => {
      btn.textContent = prev;
      btn.disabled = false;
    }, 2000);
    return;
  }
}

async function removeFromEverhour(addBtn, remBtn) {
  const { everhourToken = '' } = await storage.get('everhourToken');
  if (!everhourToken) {
    alert('Please set your Everhour token');
    return;
  }
  const weekKey = addBtn.dataset.weekKey || '';
  let ids = JSON.parse(addBtn.dataset.entryIds || '[]');
  if (!ids.length && weekKey) {
    const { everhourEntries = {} } = await storage.get('everhourEntries');
    ids = everhourEntries[weekKey] || [];
  }
  if (!ids.length) {
    addBtn.dataset.sent = 'false';
    addBtn.textContent = '+';
    if (weekKey) {
      const { everhourEntries = {} } = await storage.get('everhourEntries');
      delete everhourEntries[weekKey];
      await storage.set({ everhourEntries });
    }
    remBtn.textContent = '✓';
    setTimeout(() => { remBtn.textContent = '×'; }, 3000);
    await addLog(`Removed entry for "${weekKey.split('|')[0]}" from Everhour`);
    return;
  }
  addBtn.disabled = true;
  remBtn.disabled = true;
  const prev = remBtn.textContent;
  remBtn.textContent = '⌛';
  try {
    for (const id of ids) {
      const res = await fetch(`https://api.everhour.com/time/${id}`, {
        method: 'DELETE',
        headers: { 'X-Api-Key': everhourToken }
      });
      if (!res.ok) throw new Error('Request failed');
    }
    addBtn.dataset.sent = 'false';
    addBtn.dataset.entryIds = '';
    addBtn.textContent = '+';
    addBtn.disabled = false;
    remBtn.textContent = '✓';
    setTimeout(() => { remBtn.textContent = '×'; remBtn.disabled = false; }, 3000);
    if (weekKey) {
      const { everhourEntries = {} } = await storage.get('everhourEntries');
      delete everhourEntries[weekKey];
      await storage.set({ everhourEntries });
    }
    await addLog(`Removed entry for "${weekKey.split('|')[0]}" from Everhour`);
  } catch (e) {
    console.error(e);
    remBtn.textContent = 'Error';
    setTimeout(() => {
      remBtn.textContent = prev;
      addBtn.disabled = false;
      remBtn.disabled = false;
    }, 2000);
  }
}

// --- SUMMARY TAB ---
async function loadSummary() {
  const filter = document.getElementById('summary-filter').value;
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, 'get_week_events', async (events) => {
      const container = document.getElementById('meeting-list');
      container.innerHTML = '';
      if (chrome.runtime.lastError) {
        container.innerHTML = "<b>Could not connect to Google Calendar.<br>Open Google Calendar in a tab, switch to Week View, and try again.</b>";
        return;
      }
      if (!Array.isArray(events) || events.length === 0) {
        container.innerHTML = "<b>No events found! Make sure you are in Week View and have visible events.</b>";
        return;
      }
      const { projects = [] } = await storage.get('projects');
      const map = await getMeetingToProjectMap();
      const { everhourEntries = {} } = await storage.get('everhourEntries');
      // --- WEEK FILTER ---
      if (filter === 'week') {
        // Week logic
        const totals = {};
        for (let ev of events) {
          if (!ev.title || !ev.duration) continue;
          totals[ev.title] = (totals[ev.title] || 0) + ev.duration;
        }
        const rows = Object.entries(totals)
          .map(([title, mins]) => [title, mins])
          .sort((a, b) => b[1] - a[1]);
        const table = document.createElement('table');
        table.className = 'summary-table';
        const header = document.createElement('tr');
        header.innerHTML = "<th>Meeting</th><th>Hours</th><th>Project</th><th></th>";
        table.appendChild(header);
        for (let [title, mins] of rows) {
          const tr = document.createElement('tr');
          const hours = Math.round((mins / 60) * 100) / 100;
          // --- Project auto-link (multi-keyword) ---
          let assignedProject = map[title] || '';
          if (!assignedProject && projects.length) {
            const lowerTitle = title.toLowerCase();
            assignedProject = projects.find(p =>
              [p.name.toLowerCase(), ...(p.keywords||[]).map(k=>k.toLowerCase())]
                .some(kw => kw && lowerTitle.includes(kw))
            )?.name || '';
            if (assignedProject) {
              map[title] = assignedProject;
              setMeetingToProjectMap(map);
            }
          }
          const sel = createProjectSelect(projects, assignedProject);
          sel.onchange = async () => {
            map[title] = sel.value;
            assignedProject = sel.value;
            const proj = projects.find(p => p.name === sel.value);
            if (proj) tr.style.background = addAlpha(proj.color, 0.2);
            else tr.style.background = '';
            sel.title = sel.options[sel.selectedIndex]?.text || '';
            await setMeetingToProjectMap(map);
          };
          if (assignedProject) {
            const proj = projects.find(p => p.name === assignedProject);
            if (proj) tr.style.background = addAlpha(proj.color, 0.2);
          }
          const meetingCell = document.createElement('td');
          meetingCell.textContent = title;
          tr.appendChild(meetingCell);
          const hoursCell = document.createElement('td');
          hoursCell.textContent = hours;
          tr.appendChild(hoursCell);
          const td = document.createElement('td');
          td.appendChild(sel);
          tr.appendChild(td);
          const addTd = document.createElement('td');
          addTd.className = 'actions';
          const addBtn = document.createElement('button');
          addBtn.className = 'everhour-btn';
          addBtn.title = 'Add to Everhour';
          const remBtn = document.createElement('button');
          remBtn.className = 'remove-btn';
          remBtn.title = 'Remove entry';
          remBtn.textContent = '×';
          const titleEvents = events.filter(ev => ev.title === title);
          const weekKey = getWeekKey(title, titleEvents);
          addBtn.dataset.weekKey = weekKey;
          const storedIds = everhourEntries[weekKey] || [];
          addBtn.dataset.entryIds = JSON.stringify(storedIds);
          addBtn.dataset.sent = storedIds.length ? 'true' : 'false';
          addBtn.textContent = storedIds.length ? '✓' : '+';
          addBtn.onclick = () => sendToEverhour(title, titleEvents, sel.value || assignedProject, addBtn, weekKey);
          remBtn.onclick = () => removeFromEverhour(addBtn, remBtn);
          addTd.appendChild(addBtn);
          addTd.appendChild(remBtn);
          tr.appendChild(addTd);
          table.appendChild(tr);
        }
        container.appendChild(table);
        // No export button in popup
      } else {
        // --- DAY FILTER ---
        const dayIdx = JS_DAY_IDX[filter]; // Correct mapping
        const filteredEvents = events.filter(ev => ev.dayOfWeek === dayIdx);
        if (!filteredEvents.length) {
          container.innerHTML = `<b>No meetings for ${DAYS_LABEL[DAYS_EN.indexOf(filter)]}.</b>`;
          return;
        }
        // Group and display as for week, but only for filteredEvents
        const totals = {};
        for (let ev of filteredEvents) {
          if (!ev.title || !ev.duration) continue;
          totals[ev.title] = (totals[ev.title] || 0) + ev.duration;
        }
        const rows = Object.entries(totals)
          .map(([title, mins]) => [title, mins])
          .sort((a, b) => b[1] - a[1]);
        const label = document.createElement('div');
        label.style.margin = "10px 0 6px 0";
        label.style.fontWeight = "bold";
        label.textContent = DAYS_LABEL[DAYS_EN.indexOf(filter)];
        container.appendChild(label);
        const table = document.createElement('table');
        table.className = 'summary-table';
        const header = document.createElement('tr');
        header.innerHTML = "<th>Meeting</th><th>Hours</th><th>Project</th><th></th>";
        table.appendChild(header);
        for (let [title, mins] of rows) {
          const tr = document.createElement('tr');
          const hours = Math.round((mins / 60) * 100) / 100;
          let assignedProject = map[title] || '';
          if (!assignedProject && projects.length) {
            const lowerTitle = title.toLowerCase();
            assignedProject = projects.find(p =>
              [p.name.toLowerCase(), ...(p.keywords||[]).map(k=>k.toLowerCase())]
                .some(kw => kw && lowerTitle.includes(kw))
            )?.name || '';
            if (assignedProject) {
              map[title] = assignedProject;
              setMeetingToProjectMap(map);
            }
          }
          const sel = createProjectSelect(projects, assignedProject);
          sel.onchange = async () => {
            map[title] = sel.value;
            assignedProject = sel.value;
            const proj = projects.find(p => p.name === sel.value);
            if (proj) tr.style.background = addAlpha(proj.color, 0.2);
            else tr.style.background = '';
            sel.title = sel.options[sel.selectedIndex]?.text || '';
            await setMeetingToProjectMap(map);
          };
          if (assignedProject) {
            const proj = projects.find(p => p.name === assignedProject);
            if (proj) tr.style.background = addAlpha(proj.color, 0.2);
          }
          const meetingCell = document.createElement('td');
          meetingCell.textContent = title;
          tr.appendChild(meetingCell);
          const hoursCell = document.createElement('td');
          hoursCell.textContent = hours;
          tr.appendChild(hoursCell);
          const td = document.createElement('td');
          td.appendChild(sel);
          tr.appendChild(td);
          const addTd = document.createElement('td');
          addTd.className = 'actions';
          const addBtn = document.createElement('button');
          addBtn.className = 'everhour-btn';
          addBtn.title = 'Add to Everhour';
          const remBtn = document.createElement('button');
          remBtn.className = 'remove-btn';
          remBtn.title = 'Remove entry';
          remBtn.textContent = "×";
          const titleEvents = filteredEvents.filter(ev => ev.title === title);
          const weekKey = getWeekKey(title, titleEvents);
          addBtn.dataset.weekKey = weekKey;
          const storedIds = everhourEntries[weekKey] || [];
          addBtn.dataset.entryIds = JSON.stringify(storedIds);
          addBtn.dataset.sent = storedIds.length ? 'true' : 'false';
          addBtn.textContent = storedIds.length ? '✓' : '+';
          addBtn.onclick = () => sendToEverhour(title, titleEvents, sel.value || assignedProject, addBtn, weekKey);
          remBtn.onclick = () => removeFromEverhour(addBtn, remBtn);
          addTd.appendChild(addBtn);
          addTd.appendChild(remBtn);
          tr.appendChild(addTd);
          table.appendChild(tr);
        }
        container.appendChild(table);
        // No export button in popup
      }
    });
  });
}
document.getElementById('summary-filter').onchange = async () => {
  await storage.set({ summaryFilter: document.getElementById('summary-filter').value });
  loadSummary();
};

// --- PROJECT HOURS TAB ---
async function loadProjectHours() {
  const filter = document.getElementById('hours-filter').value;
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, 'get_week_events', async (events) => {
      const container = document.getElementById('project-hours-table');
      container.innerHTML = '';
      if (!Array.isArray(events) || events.length === 0) {
        container.innerHTML = "<b>No events found!</b>";
        return;
      }
      const { projects = [] } = await storage.get('projects');
      const map = await getMeetingToProjectMap();
      if (filter === 'week') {
        const totals = {};
        for (let ev of events) {
          if (!ev.title || !ev.duration) continue;
          const project = map[ev.title] || '';
          if (!project) continue;
          totals[project] = (totals[project] || 0) + ev.duration;
        }
        const rows = Object.entries(totals)
          .map(([project, mins]) => [project, Math.round((mins / 60) * 100) / 100])
          .sort((a, b) => b[1] - a[1]);
        const table = document.createElement('table');
        const header = document.createElement('tr');
        header.innerHTML = "<th>Project</th><th>Total Hours (this week)</th>";
        table.appendChild(header);
        for (let [project, hours] of rows) {
          const tr = document.createElement('tr');
          const proj = projects.find(p => p.name === project);
          if (proj) tr.style.background = addAlpha(proj.color, 0.2);
          const nameCell = document.createElement('td');
          nameCell.textContent = project;
          tr.appendChild(nameCell);
          const hoursCell = document.createElement('td');
          hoursCell.textContent = hours;
          tr.appendChild(hoursCell);
          table.appendChild(tr);
        }
        container.appendChild(table);
        // No export button in popup
      } else {
        // Per day
        const dayIdx = JS_DAY_IDX[filter];
        const filteredEvents = events.filter(ev => ev.dayOfWeek === dayIdx);
        if (!filteredEvents.length) {
          container.innerHTML = `<b>No project hours for ${DAYS_LABEL[DAYS_EN.indexOf(filter)]}.</b>`;
          return;
        }
        const totals = {};
        for (let ev of filteredEvents) {
          if (!ev.title || !ev.duration) continue;
          const project = map[ev.title] || '';
          if (!project) continue;
          totals[project] = (totals[project] || 0) + ev.duration;
        }
        const rows = Object.entries(totals)
          .map(([project, mins]) => [project, Math.round((mins / 60) * 100) / 100])
          .sort((a, b) => b[1] - a[1]);
        const label = document.createElement('div');
        label.style.margin = "10px 0 6px 0";
        label.style.fontWeight = "bold";
        label.textContent = DAYS_LABEL[DAYS_EN.indexOf(filter)];
        container.appendChild(label);
        const table = document.createElement('table');
        const header = document.createElement('tr');
        header.innerHTML = "<th>Project</th><th>Hours</th>";
        table.appendChild(header);
        for (let [project, hours] of rows) {
          const tr = document.createElement('tr');
          const proj = projects.find(p => p.name === project);
          if (proj) tr.style.background = addAlpha(proj.color, 0.2);
          const nameCell = document.createElement('td');
          nameCell.textContent = project;
          tr.appendChild(nameCell);
          const hoursCell = document.createElement('td');
          hoursCell.textContent = hours;
          tr.appendChild(hoursCell);
          table.appendChild(tr);
        }
        container.appendChild(table);
        // No export button in popup
      }
    });
  });
}
document.getElementById('hours-filter').onchange = async () => {
  await storage.set({ hoursFilter: document.getElementById('hours-filter').value });
  loadProjectHours();
};

// Initialize UI with last used state
restoreState();
