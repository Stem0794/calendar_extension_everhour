const fs = require('fs');
const vm = require('vm');

const contentCode = fs.readFileSync(require.resolve('../content.js'), 'utf8');

function parseFromTexts(texts) {
  const chips = texts.map(text => ({
    querySelector: (sel) =>
      sel === '.XuJrye'
        ? {
            textContent: text
          }
        : null
  }));
  const document = {
    querySelectorAll: (sel) => (sel === '[data-eventchip]' ? chips : [])
  };
  const sandbox = {
    console,
    document,
    chrome: {
      runtime: { onMessage: { addListener: jest.fn() } }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(contentCode, sandbox);
  return sandbox.parseEventsFromWeekView();
}

describe('content.js parseEventsFromWeekView', () => {
  test('parses English event chip with notes', () => {
    const events = parseFromTexts([
      'Mon 25 September 2023 from 9:00 to 10:30 Weekly Sync + Planning'
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'Weekly Sync',
      comment: 'Planning',
      duration: 90,
      date: '2023-09-25',
      startTime: '09:00'
    });
  });

  test('parses French overnight meeting', () => {
    const events = parseFromTexts([
      'lundi 2 octobre 2023 de 22h00 à 1h00 Projet Nuit'
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Projet Nuit');
    expect(events[0].duration).toBe(180);
    expect(events[0].startTime).toBe('22:00');
  });

  test('skips lunch/break events', () => {
    const events = parseFromTexts(['from 12:00 to 13:00 Lunch Break']);
    expect(events).toHaveLength(0);
  });
});
