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

// --- BETTER KEYWORD DETECTION ---

// Normalize text: remove accents and lowercase
function normalizeText(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Check if a keyword matches a title using word boundary matching
function keywordMatchesTitle(normalizedTitle, keyword) {
  const nkw = normalizeText(keyword);
  if (!nkw) return false;

  // Escape for regex
  const escaped = nkw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Word boundary match (handles single and multi-word phrases)
  if (new RegExp(`\\b${escaped}\\b`).test(normalizedTitle)) return true;

  // Multi-word keyword: check if all words appear individually as whole words
  const kwWords = nkw.split(/\s+/).filter(Boolean);
  if (kwWords.length > 1) {
    return kwWords.every(w => {
      const we = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${we}\\b`).test(normalizedTitle);
    });
  }

  return false;
}

// Check if a project's negative keywords exclude it from matching a title
function negativeKeywordsBlock(normalizedTitle, project) {
  const negatives = (project.keywords || [])
    .filter(kw => kw.startsWith('!'))
    .map(kw => kw.slice(1));
  return negatives.some(nk => keywordMatchesTitle(normalizedTitle, nk));
}

// Find the first project matching a meeting title (respects priority order + negative keywords)
function findMatchingProject(title, projects) {
  const normalizedTitle = normalizeText(title);
  // Projects are checked in array order = priority order (Feature 2)
  for (const p of projects) {
    if (negativeKeywordsBlock(normalizedTitle, p)) continue;
    const positives = [p.name, ...(p.keywords || []).filter(kw => !kw.startsWith('!'))].filter(Boolean);
    if (positives.some(kw => keywordMatchesTitle(normalizedTitle, kw))) {
      return p.name;
    }
  }
  return '';
}

// --- AUTO-SUGGEST from assignment history ---
function autoSuggestProject(title, map) {
  const normalizedTitle = normalizeText(title);
  const words = normalizedTitle.split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return '';
  // Score each project by how many words overlap with titles previously assigned to it
  const projectScores = {};
  for (const [pastTitle, project] of Object.entries(map)) {
    if (!project) continue;
    const pastNorm = normalizeText(pastTitle);
    let score = 0;
    for (const w of words) {
      if (pastNorm.includes(w)) score++;
    }
    if (score > 0) {
      projectScores[project] = (projectScores[project] || 0) + score;
    }
  }
  if (!Object.keys(projectScores).length) return '';
  return Object.entries(projectScores).sort((a, b) => b[1] - a[1])[0][0];
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
  if (activeTab === 'diff') loadDiffView();
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
    if (tab.dataset.tab === "diff") loadDiffView();
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

// Refresh button
document.getElementById('refresh-btn').onclick = () => {
  const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
  if (activeTab === 'hours') loadProjectHours();
  else loadSummary();
};

// --- PROJECT MAP ---
async function getMeetingToProjectMap() {
  return (await storage.get('meetingProjectMap')).meetingProjectMap || {};
}
async function setMeetingToProjectMap(map) {
  await storage.set({ meetingProjectMap: map });
}

// --- CHROME NOTIFICATIONS ---
function showNotification(title, message) {
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title,
      message,
    });
  }
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
  // Duplicate detection: check if already logged for this week
  if (key) {
    const { everhourEntries = {} } = await storage.get('everhourEntries');
    if (everhourEntries[key]?.length) {
      const proceed = confirm(`"${title}" appears to already be logged this week. Send anyway?`);
      if (!proceed) return;
    }
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
    showNotification('Everhour Logged', `"${title}" sent successfully`);
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

// --- LOG ALL ---
async function logAllToEverhour() {
  const btn = document.getElementById('log-all-btn');
  const statusEl = document.getElementById('log-all-status');
  btn.disabled = true;
  btn.textContent = '⌛ Logging...';
  statusEl.style.display = 'block';
  statusEl.className = 'log-all-status';
  statusEl.textContent = 'Sending all meetings to Everhour...';

  const { everhourToken = '' } = await storage.get('everhourToken');
  if (!everhourToken) {
    alert('Please set your Everhour token in Settings');
    btn.disabled = false;
    btn.textContent = 'Log All';
    statusEl.style.display = 'none';
    return;
  }

  // Get events from active Google Calendar tab
  const events = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { resolve([]); return; }
      chrome.tabs.sendMessage(tabs[0].id, 'get_week_events', (response) => {
        if (chrome.runtime.lastError || !Array.isArray(response)) {
          resolve([]);
        } else {
          resolve(response);
        }
      });
    });
  });

  if (!events.length) {
    statusEl.textContent = 'No events found. Make sure Google Calendar is open in Week View.';
    statusEl.className = 'log-all-status error';
    btn.disabled = false;
    btn.textContent = 'Log All';
    return;
  }

  const { projects = [] } = await storage.get('projects');
  const map = await getMeetingToProjectMap();
  const { everhourEntries = {} } = await storage.get('everhourEntries');

  // Group events by title
  const grouped = {};
  for (const ev of events) {
    if (!ev.title || !ev.duration) continue;
    if (!grouped[ev.title]) grouped[ev.title] = [];
    grouped[ev.title].push(ev);
  }

  let sent = 0, skipped = 0, errors = 0;

  for (const [title, titleEvents] of Object.entries(grouped)) {
    const project = map[title];
    if (!project) { skipped++; continue; }

    const taskId = projects.find(p => p.name === project)?.taskId;
    if (!taskId) { skipped++; continue; }

    const weekKey = getWeekKey(title, titleEvents);
    const storedIds = everhourEntries[weekKey] || [];
    if (storedIds.length) { skipped++; continue; } // already sent

    statusEl.textContent = `Sending "${title}"...`;
    const entryIds = [];
    try {
      for (const ev of titleEvents) {
        const res = await fetch(`https://api.everhour.com/tasks/${taskId}/time`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': everhourToken
          },
          body: JSON.stringify({
            task: taskId,
            date: ev.date,
            time: Math.round(ev.duration * 60),
            comment: ev.comment || ''
          })
        });
        if (!res.ok) throw new Error('Request failed');
        const data = await res.json().catch(() => null);
        if (data?.id) entryIds.push(data.id);
      }
      everhourEntries[weekKey] = entryIds;
      sent++;
      await addLog(`Sent "${title}" to Everhour`);
    } catch (e) {
      errors++;
      console.error(`Failed to send "${title}":`, e);
    }
  }

  await storage.set({ everhourEntries });

  // Save last batch for Undo
  const allBatchIds = Object.entries(everhourEntries)
    .filter(([, ids]) => ids.length)
    .reduce((acc, [key, ids]) => { acc[key] = ids; return acc; }, {});
  await storage.set({ lastLogAllBatch: allBatchIds });
  const undoBtn = document.getElementById('undo-log-all-btn');
  if (sent > 0) undoBtn.style.display = '';

  // Show result
  const parts = [];
  if (sent) parts.push(`${sent} sent`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (errors) parts.push(`${errors} failed`);
  statusEl.textContent = parts.join(', ') || 'Nothing to send';
  statusEl.className = errors ? 'log-all-status error' : 'log-all-status success';
  if (sent > 0) showNotification('Log All Complete', `${sent} meeting(s) logged to Everhour`);

  btn.disabled = false;
  btn.textContent = 'Log All';

  // Refresh the summary view to update button states
  loadSummary();

  setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
}

document.getElementById('log-all-btn').onclick = logAllToEverhour;

// --- UNDO LOG ALL ---
async function undoLogAll() {
  const undoBtn = document.getElementById('undo-log-all-btn');
  const statusEl = document.getElementById('log-all-status');
  const { lastLogAllBatch = {}, everhourToken = '' } = await storage.get(['lastLogAllBatch', 'everhourToken']);
  if (!everhourToken) { alert('Set your Everhour token first'); return; }

  const allIds = Object.values(lastLogAllBatch).flat();
  if (!allIds.length) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Nothing to undo';
    statusEl.className = 'log-all-status';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    return;
  }

  undoBtn.disabled = true;
  undoBtn.textContent = '⌛ Undoing...';
  statusEl.style.display = 'block';
  statusEl.textContent = `Removing ${allIds.length} entries...`;
  statusEl.className = 'log-all-status';

  let removed = 0, errors = 0;
  for (const id of allIds) {
    try {
      const res = await fetch(`https://api.everhour.com/time/${id}`, {
        method: 'DELETE',
        headers: { 'X-Api-Key': everhourToken }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      removed++;
    } catch (e) {
      errors++;
      console.error('Undo delete failed:', e);
    }
  }

  // Clean up stored entries
  const { everhourEntries = {} } = await storage.get('everhourEntries');
  for (const key of Object.keys(lastLogAllBatch)) {
    delete everhourEntries[key];
  }
  await storage.set({ everhourEntries });
  await storage.remove('lastLogAllBatch');

  statusEl.textContent = `Undo: ${removed} removed${errors ? `, ${errors} failed` : ''}`;
  statusEl.className = errors ? 'log-all-status error' : 'log-all-status success';
  undoBtn.disabled = false;
  undoBtn.textContent = 'Undo';
  undoBtn.style.display = 'none';
  await addLog(`Undo Log All: ${removed} entries removed`);
  loadSummary();
  setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
}

document.getElementById('undo-log-all-btn').onclick = undoLogAll;

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
      const unassignedOnly = document.getElementById('unassigned-filter')?.checked || false;
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
          // --- Project auto-link (improved keyword detection + auto-suggest) ---
          let assignedProject = map[title] || '';
          let isSuggested = false;
          if (!assignedProject && projects.length) {
            assignedProject = findMatchingProject(title, projects);
            if (!assignedProject) {
              assignedProject = autoSuggestProject(title, map);
              if (assignedProject) isSuggested = true;
            }
            if (assignedProject && !isSuggested) {
              map[title] = assignedProject;
              setMeetingToProjectMap(map);
            }
          }
          // Unassigned filter: skip rows with a project
          if (unassignedOnly && (assignedProject && !isSuggested)) continue;
          const sel = createProjectSelect(projects, assignedProject);
          if (isSuggested) sel.classList.add('suggested');
          sel.onchange = async () => {
            map[title] = sel.value;
            assignedProject = sel.value;
            sel.classList.remove('suggested');
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
        // Total hours row
        const totalMins = rows.reduce((sum, r) => sum + r[1], 0);
        const totalTr = document.createElement('tr');
        totalTr.className = 'total-row';
        totalTr.innerHTML = `<td><strong>Total</strong></td><td><strong>${Math.round((totalMins / 60) * 100) / 100}</strong></td><td></td><td></td>`;
        table.appendChild(totalTr);
        container.appendChild(table);
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
          let isSuggested = false;
          if (!assignedProject && projects.length) {
            assignedProject = findMatchingProject(title, projects);
            if (!assignedProject) {
              assignedProject = autoSuggestProject(title, map);
              if (assignedProject) isSuggested = true;
            }
            if (assignedProject && !isSuggested) {
              map[title] = assignedProject;
              setMeetingToProjectMap(map);
            }
          }
          // Unassigned filter: skip rows with a project
          if (unassignedOnly && (assignedProject && !isSuggested)) continue;
          const sel = createProjectSelect(projects, assignedProject);
          if (isSuggested) sel.classList.add('suggested');
          sel.onchange = async () => {
            map[title] = sel.value;
            assignedProject = sel.value;
            sel.classList.remove('suggested');
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
        // Total hours row (day view)
        const totalMins = rows.reduce((sum, r) => sum + r[1], 0);
        const totalTr = document.createElement('tr');
        totalTr.className = 'total-row';
        totalTr.innerHTML = `<td><strong>Total</strong></td><td><strong>${Math.round((totalMins / 60) * 100) / 100}</strong></td><td></td><td></td>`;
        table.appendChild(totalTr);
        container.appendChild(table);
      }
    });
  });
}
document.getElementById('summary-filter').onchange = async () => {
  await storage.set({ summaryFilter: document.getElementById('summary-filter').value });
  loadSummary();
};

// Unassigned filter checkbox
document.getElementById('unassigned-filter').onchange = () => loadSummary();

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
      }
    });
  });
}
document.getElementById('hours-filter').onchange = async () => {
  await storage.set({ hoursFilter: document.getElementById('hours-filter').value });
  loadProjectHours();
};

// --- WEEKLY DIFF VIEW (Feature 9) ---
async function saveWeekSnapshot() {
  const events = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { resolve([]); return; }
      chrome.tabs.sendMessage(tabs[0].id, 'get_week_events', (response) => {
        resolve(chrome.runtime.lastError || !Array.isArray(response) ? [] : response);
      });
    });
  });
  if (!events.length) {
    alert('No events to snapshot. Open Google Calendar in Week View.');
    return;
  }
  const map = await getMeetingToProjectMap();
  const snapshot = {};
  for (const ev of events) {
    if (!ev.title || !ev.duration) continue;
    snapshot[ev.title] = {
      minutes: (snapshot[ev.title]?.minutes || 0) + ev.duration,
      project: map[ev.title] || '',
    };
  }
  await storage.set({ weekSnapshot: snapshot, weekSnapshotDate: new Date().toISOString() });
  await addLog('Saved week snapshot');
  alert('Snapshot saved!');
  loadDiffView();
}

async function loadDiffView() {
  const container = document.getElementById('diff-content');
  container.innerHTML = '';
  const { weekSnapshot, weekSnapshotDate } = await storage.get(['weekSnapshot', 'weekSnapshotDate']);
  if (!weekSnapshot) {
    container.innerHTML = '<b>No snapshot saved yet. Click "Save Snapshot" to save the current week as a baseline.</b>';
    return;
  }

  const events = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { resolve([]); return; }
      chrome.tabs.sendMessage(tabs[0].id, 'get_week_events', (response) => {
        resolve(chrome.runtime.lastError || !Array.isArray(response) ? [] : response);
      });
    });
  });

  const current = {};
  for (const ev of events) {
    if (!ev.title || !ev.duration) continue;
    current[ev.title] = (current[ev.title] || 0) + ev.duration;
  }

  const allTitles = new Set([...Object.keys(weekSnapshot), ...Object.keys(current)]);
  const diffs = [];
  for (const title of allTitles) {
    const oldMins = weekSnapshot[title]?.minutes || 0;
    const newMins = current[title] || 0;
    if (oldMins !== newMins) {
      diffs.push({ title, oldMins, newMins, delta: newMins - oldMins });
    }
  }

  if (!diffs.length) {
    container.innerHTML = `<b>No changes since snapshot (${new Date(weekSnapshotDate).toLocaleDateString()}).</b>`;
    return;
  }

  const dateLabel = document.createElement('div');
  dateLabel.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;';
  dateLabel.textContent = `Compared to snapshot from ${new Date(weekSnapshotDate).toLocaleDateString()}`;
  container.appendChild(dateLabel);

  const table = document.createElement('table');
  table.className = 'summary-table';
  const header = document.createElement('tr');
  header.innerHTML = '<th>Meeting</th><th>Previous</th><th>Current</th><th>Change</th>';
  table.appendChild(header);

  for (const d of diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))) {
    const tr = document.createElement('tr');
    const oldH = Math.round((d.oldMins / 60) * 100) / 100;
    const newH = Math.round((d.newMins / 60) * 100) / 100;
    const deltaH = Math.round((d.delta / 60) * 100) / 100;
    const sign = deltaH > 0 ? '+' : '';
    tr.className = d.oldMins === 0 ? 'diff-added' : d.newMins === 0 ? 'diff-removed' : 'diff-changed';
    tr.innerHTML = `<td>${d.title}</td><td>${oldH}h</td><td>${newH}h</td><td>${sign}${deltaH}h</td>`;
    table.appendChild(tr);
  }
  container.appendChild(table);
}

document.getElementById('save-week-snapshot').onclick = saveWeekSnapshot;

// --- KEYBOARD SHORTCUT LISTENER (Feature 10) ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'command') {
    if (msg.command === 'log-all') logAllToEverhour();
    if (msg.command === 'refresh-events') {
      const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
      if (activeTab === 'hours') loadProjectHours();
      else loadSummary();
    }
  }
  if (msg.type === 'offline-retry-success') {
    showNotification('Offline Queue', `"${msg.title}" sent successfully after retry`);
  }
  if (msg.type === 'offline-retry-failed') {
    showNotification('Offline Queue Failed', `"${msg.title}" could not be sent after retries`);
  }
});

// --- EVERHOUR SYNC CHECK (Feature 11) ---
async function checkEverhourSync() {
  const statusEl = document.getElementById('sync-check-status');
  const btn = document.getElementById('sync-check-btn');
  statusEl.style.display = 'block';
  statusEl.className = 'log-all-status';
  statusEl.textContent = 'Checking sync status...';
  btn.disabled = true;

  const { everhourToken = '' } = await storage.get('everhourToken');
  if (!everhourToken) {
    statusEl.textContent = 'Set Everhour token in Settings first';
    statusEl.className = 'log-all-status error';
    btn.disabled = false;
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    return;
  }

  const { everhourEntries = {} } = await storage.get('everhourEntries');
  const entryIds = Object.values(everhourEntries).flat();

  if (!entryIds.length) {
    statusEl.textContent = 'No logged entries to verify';
    btn.disabled = false;
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    return;
  }

  let verified = 0, missing = 0;
  // Spot-check up to 5 entries to avoid rate limits
  const sample = entryIds.slice(0, 5);
  for (const id of sample) {
    try {
      const res = await fetch(`https://api.everhour.com/time/${id}`, {
        headers: { 'X-Api-Key': everhourToken }
      });
      if (res.ok) verified++;
      else missing++;
    } catch {
      missing++;
    }
  }

  const total = entryIds.length;
  if (missing === 0) {
    statusEl.textContent = `Sync OK: ${verified}/${sample.length} checked entries verified (${total} total)`;
    statusEl.className = 'log-all-status success';
  } else {
    statusEl.textContent = `Sync issue: ${missing}/${sample.length} entries not found in Everhour`;
    statusEl.className = 'log-all-status error';
  }
  btn.disabled = false;
  setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
}

document.getElementById('sync-check-btn').onclick = checkEverhourSync;

// --- OFFLINE QUEUE (Feature 12) ---
async function showOfflineQueueStatus() {
  const statusEl = document.getElementById('offline-queue-status');
  const { offlineQueue = [] } = await storage.get('offlineQueue');
  if (offlineQueue.length) {
    statusEl.style.display = 'block';
    statusEl.className = 'log-all-status';
    statusEl.textContent = `${offlineQueue.length} request(s) queued offline. They'll retry automatically.`;
  } else {
    statusEl.style.display = 'none';
  }
}

// Wrap fetch for offline fallback in Everhour calls
const originalSendToEverhour = sendToEverhour;
// Note: offline queuing is handled in background.js via message passing

// Check offline queue on load
showOfflineQueueStatus();
chrome.storage.onChanged.addListener((changes) => {
  if (changes.offlineQueue) showOfflineQueueStatus();
});

// --- DARK MODE (Feature: CSS toggle) ---
async function initDarkMode() {
  const { darkMode = false } = await storage.get('darkMode');
  if (darkMode) document.body.classList.add('dark');
  updateDarkModeIcon(darkMode);
}

function updateDarkModeIcon(isDark) {
  const btn = document.getElementById('dark-mode-toggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

document.getElementById('dark-mode-toggle').onclick = async () => {
  const isDark = document.body.classList.toggle('dark');
  await storage.set({ darkMode: isDark });
  updateDarkModeIcon(isDark);
};

initDarkMode();

// Initialize UI with last used state
restoreState();
