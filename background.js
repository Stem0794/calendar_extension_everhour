// Global error handlers for service worker
self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in background:', event.reason);
});

self.onerror = (msg, url, line, col, error) => {
  console.error('Background service worker error:', msg, error);
};

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// --- Keyboard shortcut handler ---
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  // Forward command to the side panel / popup via message
  chrome.runtime.sendMessage({ type: 'command', command });
});

// --- Offline retry queue ---
// Stores failed Everhour API requests and retries when back online

const OFFLINE_QUEUE_KEY = 'offlineQueue';
const MAX_RETRIES = 5;
const RETRY_DELAYS = [2000, 4000, 8000, 16000, 32000];

async function getOfflineQueue() {
  const { offlineQueue = [] } = await chrome.storage.local.get(OFFLINE_QUEUE_KEY);
  return offlineQueue;
}

async function saveOfflineQueue(queue) {
  await chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: queue });
}

async function enqueueRequest(request) {
  const queue = await getOfflineQueue();
  queue.push({ ...request, retries: 0, enqueuedAt: Date.now() });
  await saveOfflineQueue(queue);
}

async function processOfflineQueue() {
  const queue = await getOfflineQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Success — notify popup
      chrome.runtime.sendMessage({
        type: 'offline-retry-success',
        title: item.title || 'Unknown',
      });
    } catch (e) {
      item.retries = (item.retries || 0) + 1;
      if (item.retries < MAX_RETRIES) {
        remaining.push(item);
      } else {
        // Give up after max retries — notify
        chrome.runtime.sendMessage({
          type: 'offline-retry-failed',
          title: item.title || 'Unknown',
        });
      }
    }
  }
  await saveOfflineQueue(remaining);
}

// Listen for online events and messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'enqueue-offline') {
    enqueueRequest(msg.request).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'process-offline-queue') {
    processOfflineQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// Periodic alarm to retry offline queue
chrome.alarms.create('retryOfflineQueue', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'retryOfflineQueue') {
    processOfflineQueue().catch(e => console.error('Offline queue retry error:', e));
  }
});
