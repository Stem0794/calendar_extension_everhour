/**
 * Slack Bot Scaffold — Weekly Hours Summary
 *
 * Posts a weekly project-hours summary to a Slack channel
 * using Everhour API data.
 *
 * Setup:
 *   1. npm install in this directory
 *   2. Copy .env.example to .env and fill in your tokens
 *   3. Run: node index.js
 *
 * For scheduled posting, use cron or a process manager.
 */

require('dotenv').config();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const EVERHOUR_API_KEY = process.env.EVERHOUR_API_KEY;
const EVERHOUR_API_BASE = 'https://api.everhour.com';

async function fetchWeeklyTime() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const from = monday.toISOString().slice(0, 10);
  const to = friday.toISOString().slice(0, 10);

  const res = await fetch(
    `${EVERHOUR_API_BASE}/team/time?from=${from}&to=${to}`,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': EVERHOUR_API_KEY,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Everhour API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function formatSummary(entries) {
  if (!entries || !entries.length) {
    return 'No time entries found for this week.';
  }

  const byProject = {};
  for (const entry of entries) {
    const project = entry.task?.projects?.[0]?.name || 'Unassigned';
    const hours = (entry.time || 0) / 3600;
    byProject[project] = (byProject[project] || 0) + hours;
  }

  const lines = Object.entries(byProject)
    .sort((a, b) => b[1] - a[1])
    .map(([project, hours]) => `  *${project}*: ${hours.toFixed(2)}h`);

  const total = Object.values(byProject).reduce((a, b) => a + b, 0);

  return [
    ':calendar: *Weekly Hours Summary*',
    '',
    ...lines,
    '',
    `*Total: ${total.toFixed(2)}h*`,
  ].join('\n');
}

async function postToSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook error: ${res.status}`);
  }
}

async function main() {
  if (!SLACK_WEBHOOK_URL) {
    console.error('Missing SLACK_WEBHOOK_URL in .env');
    process.exit(1);
  }
  if (!EVERHOUR_API_KEY) {
    console.error('Missing EVERHOUR_API_KEY in .env');
    process.exit(1);
  }

  console.log('Fetching weekly time from Everhour...');
  const entries = await fetchWeeklyTime();

  const summary = formatSummary(entries);
  console.log('Summary:\n', summary);

  console.log('Posting to Slack...');
  await postToSlack(summary);
  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
