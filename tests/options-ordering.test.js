const fs = require('fs');
const path = require('path');

class FakeClassList {
  constructor() {
    this._set = new Set();
  }
  add(...cls) {
    cls.forEach((c) => this._set.add(c));
  }
  remove(...cls) {
    cls.forEach((c) => this._set.delete(c));
  }
  contains(c) {
    return this._set.has(c);
  }
  toString() {
    return Array.from(this._set).join(' ');
  }
}

class FakeElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.classList = new FakeClassList();
    this.draggable = false;
    this.textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.title = '';
  }
  set className(val) {
    this.classList = new FakeClassList();
    val
      .split(' ')
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((c) => this.classList.add(c));
  }
  get className() {
    return this.classList.toString();
  }
  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
  }
  get innerHTML() {
    return this._innerHTML;
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }
  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    handlers.forEach((h) => h(event));
    return !event.defaultPrevented;
  }
  querySelectorAll(selector) {
    const matches = [];
    const needsClass = selector.startsWith('.');
    const classParts = needsClass ? selector.slice(1).split('.').filter(Boolean) : [];
    const visit = (el) => {
      if (needsClass) {
        const ok = classParts.every((c) => el.classList.contains(c));
        if (ok) matches.push(el);
      }
      el.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('document');
    this.elementsById = {};
  }
  createElement(tagName) {
    return new FakeElement(tagName);
  }
  register(el) {
    if (el.id) this.elementsById[el.id] = el;
    this.appendChild(el);
    return el;
  }
  getElementById(id) {
    return this.elementsById[id] || null;
  }
  querySelectorAll(selector) {
    const matches = [];
    const needsClass = selector.startsWith('.');
    const classParts = needsClass ? selector.slice(1).split('.').filter(Boolean) : [];
    const visit = (el) => {
      if (needsClass) {
        const ok = classParts.every((c) => el.classList.contains(c));
        if (ok) matches.push(el);
      }
      el.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

function buildDomSkeleton() {
  const doc = new FakeDocument();
  ['projects', 'everhour', 'activity'].forEach((tabName) => {
    const tab = doc.register(new FakeElement('div'));
    tab.classList.add('tab');
    tab.dataset.tab = tabName;
  });
  ['projects', 'everhour', 'activity'].forEach((tabName) => {
    const content = doc.register(new FakeElement('div', tabName));
    content.classList.add('tab-content');
  });
  doc.register(new FakeElement('input', 'everhour-token'));
  doc.register(new FakeElement('button', 'save-token'));
  doc.register(new FakeElement('input', 'new-project'));
  doc.register(new FakeElement('input', 'new-project-color'));
  doc.register(new FakeElement('input', 'new-project-keywords'));
  doc.register(new FakeElement('input', 'new-project-task'));
  doc.register(new FakeElement('input', 'new-project-group'));
  doc.register(new FakeElement('button', 'add-project'));
  doc.register(new FakeElement('ul', 'project-list'));
  doc.register(new FakeElement('ul', 'log-list'));
  doc.register(new FakeElement('button', 'export-settings'));
  doc.register(new FakeElement('button', 'import-settings'));
  doc.register(new FakeElement('input', 'import-file'));
  doc.register(new FakeElement('a', 'download-link'));
  return doc;
}

function createChromeMock(initialData) {
  const store = { ...initialData };
  return {
    storage: {
      local: {
        _data: store,
        get(keys, cb) {
          if (keys === null || keys === undefined) {
            cb({ ...this._data });
            return;
          }
          if (Array.isArray(keys)) {
            const res = {};
            keys.forEach((k) => (res[k] = this._data[k]));
            cb(res);
            return;
          }
          cb({ [keys]: this._data[keys] });
        },
        set(obj, cb) {
          Object.assign(this._data, obj);
          if (cb) cb();
        },
        remove(key, cb) {
          delete this._data[key];
          if (cb) cb();
        }
      },
      onChanged: { addListener: jest.fn() }
    },
    runtime: { openOptionsPage: jest.fn() }
  };
}

function loadOptionsWithData(data) {
  global.document = buildDomSkeleton();
  global.window = {};
  global.alert = jest.fn();
  global.URL = {
    createObjectURL: jest.fn(() => 'blob:mock'),
    revokeObjectURL: jest.fn()
  };
  global.chrome = createChromeMock(data);

  jest.isolateModules(() => {
    const optionsPath = path.join(__dirname, '..', 'options.js');
    const code = fs.readFileSync(optionsPath, 'utf8');
    // eslint-disable-next-line no-eval
    eval(code);
  });
}

describe('options.js project ordering', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('adds a new project within its group rather than at the end', async () => {
    const initialProjects = [
      { name: 'Alpha', group: 'Team', color: '#111' },
      { name: 'Beta', group: 'Team', color: '#222' },
      { name: 'Gamma', group: '', color: '#333' }
    ];
    loadOptionsWithData({ projects: initialProjects, logs: [] });
    await new Promise((res) => setTimeout(res, 0));

    document.getElementById('new-project').value = 'Delta';
    document.getElementById('new-project-group').value = 'Team';
    document.getElementById('new-project-color').value = '#444444';
    document.getElementById('new-project-keywords').value = '';
    document.getElementById('new-project-task').value = '';

    await document.getElementById('add-project').onclick();

    const names = global.chrome.storage.local._data.projects.map((p) => p.name);
    expect(names).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
  });

  test('drag and drop reorders projects and persists the new order', async () => {
    const initialProjects = [
      { name: 'Alpha', group: 'Team', color: '#111' },
      { name: 'Beta', group: 'Team', color: '#222' },
      { name: 'Gamma', group: 'Team', color: '#333' }
    ];
    loadOptionsWithData({ projects: initialProjects, logs: [] });
    await new Promise((res) => setTimeout(res, 0));

    const items = Array.from(document.querySelectorAll('.project-item'));
    expect(items).toHaveLength(3);

    const dragItem = items[0];
    const targetItem = items[2];
    const dataTransfer = { effectAllowed: '', dropEffect: '' };

    const dragStart = { type: 'dragstart', dataTransfer };
    dragItem.dispatchEvent(dragStart);

    const dropEvent = { type: 'drop', dataTransfer, preventDefault: () => {}, defaultPrevented: false };
    dropEvent.preventDefault = () => {
      dropEvent.defaultPrevented = true;
    };
    targetItem.dispatchEvent(dropEvent);

    await new Promise((res) => setTimeout(res, 0));

    const names = global.chrome.storage.local._data.projects.map((p) => p.name);
    expect(names).toEqual(['Beta', 'Alpha', 'Gamma']);
  });
});
