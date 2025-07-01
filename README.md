# Calendar to Project Hours – Chrome Extension

A lightweight Chrome extension that helps you track and summarize your Google Calendar meetings by project. It auto-detects meetings, links them to projects, and exports weekly or daily hour summaries to make time tracking faster and easier.

## 🔧 Features

- Detects meetings from your **Google Calendar** in **Week View**
- Works with Google Calendar interfaces in **English** or **French**
- Allows you to assign each meeting to a **project**
- **Auto-links** recurring meetings to their projects using custom keywords
- **Color-code** each project for clarity
- Shows total hours per **project**, per **day**, or **per week**
- Export summaries as **CSV** files (per week, per day, or across weeks)
- Quickly send a meeting's time to **Everhour**
- Simple **onboarding tooltip** to get started
- Modern, clean UI

## 🚀 How to Use

1. Open [Google Calendar](https://calendar.google.com) in **Week View**
2. Click the extension icon
3. Use the **Summary** tab to assign meetings to projects
4. View project totals in the **Project Hours** tab
5. Export your data if needed for reporting
6. In the **Projects** tab, enter your Everhour API token and each project's task ID

> Tip: Add custom **keywords** when creating projects to auto-link new meetings in future weeks.

## 🗂 Tabs Overview

- **Summary** – See and tag this week’s meetings
- **Project Hours** – View total hours per project (weekly or daily)
- **Projects** – Create, rename, color, or delete projects and keywords

## 💾 Installation

1. Clone this repo or download as ZIP
2. Go to `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load unpacked**
5. Select the folder with this extension

## 📤 Export Formats

- `weekly_calendar_summary.csv`
- `project_hours_summary.csv`
- Daily versions like `calendar_monday.csv`, etc.

## ✅ Requirements

- Must be used on the **Google Calendar web app**
- Must be in **Week View** for detection to work

## 🔑 Everhour Setup

1. Open the **Projects** tab of the popup.
2. Enter your Everhour API token in the settings field and click **Save**.
3. For each project, provide the Everhour task ID so time can be logged.
4. Use the **Add to Everhour** button next to a meeting to log its time via Everhour's `/tasks/{id}/time` endpoint.
4. For each project, provide the Everhour task ID so time can be logged.
5. Use the **Add to Everhour** button next to a meeting to log its time via Everhour's `/tasks/{id}/time` endpoint.
6. Use the **Add to Everhour** button next to a meeting to send its time entry.

## 👤 Author
GitHub: [@Stem0794](https://github.com/Stem0794)

---

MIT License
