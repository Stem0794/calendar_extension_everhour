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

// --- TABS ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === "hours") loadProjectHours();
    if (tab.dataset.tab === "projects") renderProjectList();
    if (tab.dataset.tab === "summary") loadSummary();
  };
});

// --- STORAGE UTIL ---
const storage = {
  get: keys => new Promise(res => chrome.storage.local.get(keys, res)),
  set: obj => new Promise(res => chrome.storage.local.set(obj, res)),
  remove: key => new Promise(res => chrome.storage.local.remove(key, res)),
};

// --- PROJECTS CRUD ---
async function renderProjectList() {
  const { projects = [] } = await storage.get('projects');
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  projects.forEach((proj, idx) => {
    const li = document.createElement('li');
    li.style.alignItems = 'center';
    const dot = `<span class="color-dot" style="background:${proj.color||'#c1d6f9'};"></span>`;
    // Editing
    if (proj._edit) {
      li.innerHTML = `${dot}<input type="text" class="rename-input" value="${proj.name}" id="rename-proj-${idx}"/>`
      + `<input type="color" id="edit-color-${idx}" value="${proj.color||'#42a5f5'}" style="margin-left:6px;width:32px;"/>`
      + `<input type="text" class="keyword-input" value="${(proj.keywords||[]).join(', ')}" id="edit-keywords-${idx}" placeholder="Keywords"/>`
      + `<button class="save-btn" data-idx="${idx}">Save</button><button class="cancel-btn" data-idx="${idx}">Cancel</button>`;
    } else {
      li.innerHTML = `${dot}<span>${proj.name}</span>`
        + `<span style="margin-left:7px;font-size:11px;color:#8c98ac;">[${(proj.keywords||[]).join(', ')}]</span>`
        + `<button class="edit-btn" data-idx="${idx}">Edit</button>`
        + `<button class="delete-btn" data-idx="${idx}" title="Delete">Delete</button>`;
    }
    list.appendChild(li);
  });
  // Edit, Save, Cancel, Delete
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = async () => {
      const { projects = [] } = await storage.get('projects');
      projects[+btn.dataset.idx]._edit = true;
      await storage.set({ projects });
      renderProjectList();
    };
  });
  list.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.onclick = async () => {
      const { projects = [] } = await storage.get('projects');
      projects[+btn.dataset.idx]._edit = false;
      await storage.set({ projects });
      renderProjectList();
    };
  });
  list.querySelectorAll('.save-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.idx;
      const name = document.getElementById(`rename-proj-${idx}`).value.trim();
      const color = document.getElementById(`edit-color-${idx}`).value;
      const keywords = document.getElementById(`edit-keywords-${idx}`).value.split(',').map(k=>k.trim()).filter(Boolean);
      let { projects = [] } = await storage.get('projects');
      // Validation
      if (!name) {
        alert('Project name cannot be empty');
        return;
      }
      const nameLower = name.toLowerCase();
      if (projects.some((p,i) => i !== idx && p.name.toLowerCase() === nameLower)) {
        alert('A project with this name already exists');
        return;
      }
      const oldName = projects[idx].name;
      projects[idx] = { name, color, keywords, _edit: false };
      await storage.set({ projects });
      // Update mapping for meetings previously linked to oldName
      let { meetingProjectMap={} } = await storage.get('meetingProjectMap');
      if (name !== oldName) {
        Object.keys(meetingProjectMap).forEach(tit => {
          if (meetingProjectMap[tit] === oldName) meetingProjectMap[tit] = name;
        });
        await storage.set({ meetingProjectMap });
      }
      renderProjectList();
      // Refresh other tabs after renaming
      loadSummary();
      loadProjectHours();
    }
  });
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async () => {
      let { projects = [] } = await storage.get('projects');
      const toDelete = projects[+btn.dataset.idx].name;
      projects.splice(+btn.dataset.idx, 1);
      await storage.set({ projects });
      // Remove from mapping
      let { meetingProjectMap={} } = await storage.get('meetingProjectMap');
      Object.keys(meetingProjectMap).forEach(tit => {
        if (meetingProjectMap[tit] === toDelete) delete meetingProjectMap[tit];
      });
      await storage.set({ meetingProjectMap });
      renderProjectList();
      // Refresh view
      loadSummary();
      loadProjectHours();
    };
  });
}
document.getElementById('add-project').onclick = async () => {
  const inp = document.getElementById('new-project');
  const color = document.getElementById('new-project-color').value || '#42a5f5';
  const kwds = document.getElementById('new-project-keywords').value.split(',').map(k=>k.trim()).filter(Boolean);
  const name = inp.value.trim();
  if (!name) return;
  let { projects = [] } = await storage.get('projects');
  if (!projects.find(p=>p.name===name)) {
    projects.push({ name, color, keywords: kwds });
    await storage.set({ projects });
    renderProjectList();
  }
  inp.value = '';
  document.getElementById('new-project-keywords').value = '';
};

// --- PROJECT MAP ---
async function getMeetingToProjectMap() {
  return (await storage.get('meetingProjectMap')).meetingProjectMap || {};
}
async function setMeetingToProjectMap(map) {
  await storage.set({ meetingProjectMap: map });
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
        header.innerHTML = "<th>Meeting</th><th>Hours</th><th>Project</th>";
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
          const sel = document.createElement('select');
          sel.innerHTML = '<option value="">-</option>' +
            projects.map(p => `<option value="${p.name}" style="background:${p.color};" ${assignedProject === p.name ? "selected" : ""}>${p.name}</option>`).join('');
          sel.onchange = async () => {
            map[title] = sel.value;
            await setMeetingToProjectMap(map);
          };
          if (assignedProject) {
            const proj = projects.find(p => p.name === assignedProject);
            if (proj) tr.style.background = addAlpha(proj.color, 0.2);
          }
          tr.innerHTML = `<td>${title}</td><td>${hours}</td>`;
          const td = document.createElement('td');
          td.appendChild(sel);
          tr.appendChild(td);
          table.appendChild(tr);
        }
        container.appendChild(table);
        // CSV Export
        document.getElementById('export').onclick = () => {
          const csvRows = [['Meeting', 'Hours', 'Project']];
          for (let [title, mins] of rows) {
            const hours = Math.round((mins / 60) * 100) / 100;
            csvRows.push([title, hours, map[title] || '']);
          }
          const csv = csvRows
            .map(r => r.map(quoteField).join(','))
            .join('\r\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'weekly_calendar_summary.csv';
          a.click();
          URL.revokeObjectURL(url);
        };
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
        header.innerHTML = "<th>Meeting</th><th>Hours</th><th>Project</th>";
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
          const sel = document.createElement('select');
          sel.innerHTML = '<option value="">-</option>' +
            projects.map(p => `<option value="${p.name}" style="background:${p.color};" ${assignedProject === p.name ? "selected" : ""}>${p.name}</option>`).join('');
          sel.onchange = async () => {
            map[title] = sel.value;
            await setMeetingToProjectMap(map);
          };
          if (assignedProject) {
            const proj = projects.find(p => p.name === assignedProject);
            if (proj) tr.style.background = addAlpha(proj.color, 0.2);
          }
          tr.innerHTML = `<td>${title}</td><td>${hours}</td>`;
          const td = document.createElement('td');
          td.appendChild(sel);
          tr.appendChild(td);
          table.appendChild(tr);
        }
        container.appendChild(table);
        // CSV Export day
        document.getElementById('export').onclick = () => {
          const csvRows = [['Meeting', 'Hours', 'Project']];
          for (let [title, mins] of rows) {
            const hours = Math.round((mins / 60) * 100) / 100;
            csvRows.push([title, hours, map[title] || '']);
          }
          const csv = csvRows
            .map(r => r.map(quoteField).join(','))
            .join('\r\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `calendar_${filter}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        };
      }
    });
  });
}
document.getElementById('summary-filter').onchange = loadSummary;
loadSummary();

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
          tr.innerHTML = `<td>${project}</td><td>${hours}</td>`;
          table.appendChild(tr);
        }
        container.appendChild(table);
        document.getElementById('export-hours').onclick = () => {
          const csvRows = [['Project', 'Total Hours (this week)']];
          for (let [project, hours] of rows) {
            csvRows.push([project, hours]);
          }
          const csv = csvRows
            .map(r => r.map(quoteField).join(','))
            .join('\r\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'project_hours_summary.csv';
          a.click();
          URL.revokeObjectURL(url);
        };
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
          tr.innerHTML = `<td>${project}</td><td>${hours}</td>`;
          table.appendChild(tr);
        }
        container.appendChild(table);
        document.getElementById('export-hours').onclick = () => {
          const csvRows = [['Project', 'Hours']];
          for (let [project, hours] of rows) {
            csvRows.push([project, hours]);
          }
          const csv = csvRows
            .map(r => r.map(quoteField).join(','))
            .join('\r\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `project_hours_${filter}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        };
      }
    });
  });
}
document.getElementById('hours-filter').onchange = loadProjectHours;
