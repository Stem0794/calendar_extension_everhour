const { test, expect } = require('@playwright/test');
test.describe.skip('Extension smoke suite', () => {
  test('loads popup UI (placeholder)', async ({ browserName }) => {
    test.info().annotations.push({ type: 'note', description: 'Implement after adding mock calendar page' });
    expect(browserName).toBeDefined();
  });
});
