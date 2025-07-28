// Storage helpers
const storage = {
  get: keys => new Promise(res => chrome.storage.local.get(keys, res)),
  set: obj => new Promise(res => chrome.storage.local.set(obj, res)),
  remove: key => new Promise(res => chrome.storage.local.remove(key, res)),
};

async function addLog(message) {
  const { logs = [] } = await storage.get('logs');
  logs.push({ msg: message, date: new Date().toLocaleString() });
  await storage.set({ logs });
}

async function loadLogs() {
  const { logs = [] } = await storage.get('logs');
  const list = document.getElementById('log-list');
  if (!list) return;
  list.innerHTML = '';
  logs.slice().reverse().forEach(l => {
    const li = document.createElement('li');
    li.textContent = `[${l.date}] ${l.msg}`;
    list.appendChild(li);
  });
}


// Load and save Everhour token
async function loadEverhourToken() {
  const { everhourToken = '' } = await storage.get('everhourToken');
  document.getElementById('everhour-token').value = everhourToken;
}

async function saveEverhourToken() {
  const token = document.getElementById('everhour-token').value.trim();
  await storage.set({ everhourToken: token });
  await addLog('Everhour token updated');
  const status = document.getElementById('token-status');
  status.textContent = 'Saved!';
  setTimeout(() => { status.textContent = ''; }, 1500);
  loadLogs();
}

document.getElementById('save-token').onclick = saveEverhourToken;

// Project list rendering and CRUD
async function renderProjectList() {
  const { projects = [] } = await storage.get('projects');
  const list = document.getElementById('project-list');
  list.innerHTML = '';
  const groupBounds = {};
  projects.forEach((p,i)=>{
    const g = p.group || '';
    if(!groupBounds[g]) groupBounds[g] = {first:i,last:i};
    else groupBounds[g].last = i;
  });
  let lastGroup = null;
  projects.forEach((proj, idx) => {
    if (proj.group !== lastGroup) {
      const gh = document.createElement('li');
      gh.textContent = proj.group || 'Ungrouped';
      gh.className = 'group-header';
      list.appendChild(gh);
      lastGroup = proj.group;
    }
    const li = document.createElement('li');
    li.style.alignItems = 'center';
    const dot = `<span class="color-dot" style="background:${proj.color||'#c1d6f9'};"></span>`;
    const bounds = groupBounds[proj.group || ''];
    const showUp = idx > bounds.first;
    const showDown = idx < bounds.last;
    if (proj._edit) {
      li.innerHTML = `${dot}<input type="text" class="rename-input" value="${proj.name}" id="rename-proj-${idx}"/>`
        + `<input type="color" id="edit-color-${idx}" value="${proj.color||'#42a5f5'}" style="margin-left:6px;width:32px;"/>`
        + `<input type="text" class="keyword-input" value="${(proj.keywords||[]).join(', ')}" id="edit-keywords-${idx}" placeholder="Keywords"/>`
        + `<input type="text" class="task-input" value="${proj.taskId||''}" id="edit-task-${idx}" placeholder="Task ID"/>`
        + `<input type="text" class="group-input" value="${proj.group||''}" id="edit-group-${idx}" placeholder="Group"/>`
        + `<button class="save-btn" data-idx="${idx}">Save</button><button class="cancel-btn" data-idx="${idx}">Cancel</button>`;
    } else {
      li.innerHTML = `${dot}<span>${proj.name}</span>`
        + `<span style="margin-left:7px;font-size:11px;color:#8c98ac;">[${(proj.keywords||[]).join(', ')}]</span>`
        + (proj.taskId ? `<span style="margin-left:7px;font-size:11px;color:#8c98ac;">(${proj.taskId})</span>` : '')
        + `<button class="edit-btn" data-idx="${idx}">Edit</button>`
        + `<button class="delete-btn" data-idx="${idx}" title="Delete">Delete</button>`
        + (showUp ? `<button class="move-btn up" data-idx="${idx}" title="Move up">↑</button>` : '')
        + (showDown ? `<button class="move-btn down" data-idx="${idx}" title="Move down">↓</button>` : '');
    }
    list.appendChild(li);
  });
  // Edit project
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = async () => {
      const { projects = [] } = await storage.get('projects');
      projects[+btn.dataset.idx]._edit = true;
      await storage.set({ projects });
      renderProjectList();
    };
  });
  // Cancel edit
  list.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.onclick = async () => {
      const { projects = [] } = await storage.get('projects');
      projects[+btn.dataset.idx]._edit = false;
      await storage.set({ projects });
      renderProjectList();
    };
  });
  // Save edits
  list.querySelectorAll('.save-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.idx;
      const name = document.getElementById(`rename-proj-${idx}`).value.trim();
      const color = document.getElementById(`edit-color-${idx}`).value;
      const keywords = document.getElementById(`edit-keywords-${idx}`).value.split(',').map(k=>k.trim()).filter(Boolean);
      const taskId = document.getElementById(`edit-task-${idx}`).value.trim();
      const group = document.getElementById(`edit-group-${idx}`).value.trim();
      let { projects = [] } = await storage.get('projects');
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
      projects[idx] = { name, color, keywords, taskId, group, _edit: false };
      await storage.set({ projects });
      let { meetingProjectMap={} } = await storage.get('meetingProjectMap');
      if (name !== oldName) {
        Object.keys(meetingProjectMap).forEach(t => {
          if (meetingProjectMap[t] === oldName) meetingProjectMap[t] = name;
        });
        await storage.set({ meetingProjectMap });
      }
      renderProjectList();
    };
  });
  // Delete project
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async () => {
      let { projects = [] } = await storage.get('projects');
      const toDelete = projects[+btn.dataset.idx].name;
      projects.splice(+btn.dataset.idx, 1);
      await storage.set({ projects });
      let { meetingProjectMap={} } = await storage.get('meetingProjectMap');
      Object.keys(meetingProjectMap).forEach(t => {
        if (meetingProjectMap[t] === toDelete) delete meetingProjectMap[t];
      });
      await storage.set({ meetingProjectMap });
      renderProjectList();
    };
  });
  // Move project
  function move(idx, dir){
    storage.get('projects').then(({projects=[]})=>{
      const ni = idx + dir;
      if(ni<0 || ni>=projects.length) return;
      const [p] = projects.splice(idx,1);
      projects.splice(ni,0,p);
      storage.set({projects}).then(renderProjectList);
    });
  }
  list.querySelectorAll('.move-btn.up').forEach(btn=>{
    btn.onclick = ()=> move(+btn.dataset.idx,-1);
  });
  list.querySelectorAll('.move-btn.down').forEach(btn=>{
    btn.onclick = ()=> move(+btn.dataset.idx,1);
  });
}

// Add new project
document.getElementById('add-project').onclick = async () => {
  const inp = document.getElementById('new-project');
  const color = document.getElementById('new-project-color').value || '#42a5f5';
  const kwds = document.getElementById('new-project-keywords').value.split(',').map(k=>k.trim()).filter(Boolean);
  const taskId = document.getElementById('new-project-task').value.trim();
  const group = document.getElementById('new-project-group').value.trim();
  const name = inp.value.trim();
  if (!name) return;
  let { projects = [] } = await storage.get('projects');
  if (!projects.find(p => p.name === name)) {
    projects.push({ name, color, keywords: kwds, taskId, group });
    await storage.set({ projects });
    renderProjectList();
  }
  inp.value = '';
  document.getElementById('new-project-keywords').value = '';
  document.getElementById('new-project-task').value = '';
  document.getElementById('new-project-group').value = '';
};


// Init
loadEverhourToken();
renderProjectList();
loadLogs();
chrome.storage.onChanged.addListener(changes => {
  if (changes.logs) loadLogs();
});
