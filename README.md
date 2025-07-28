# Calendar to Project Hours – Chrome Extension

A lightweight Chrome extension that helps you track and summarize your Google Calendar meetings by project. It auto-detects meetings, links them to projects, and lets you quickly log time to Everhour.

## 🔧 Features

- Detects meetings from your **Google Calendar** in **Week View**
- Works with Google Calendar interfaces in **English** or **French**
- Allows you to assign each meeting to a **project**
- **Auto-links** recurring meetings to their projects using custom keywords
- **Color-code** each project for clarity
- Shows total hours per **project**, per **day**, or **per week**
- Quickly send a meeting's time to **Everhour**
- Simple **onboarding tooltip** to get started
- Modern, clean UI
- Reorder and group projects in settings

## 🚀 How to Use

1. Open [Google Calendar](https://calendar.google.com) in **Week View**
2. Click the extension icon (use **Options** or the **Open Settings Page** button in the Settings tab for a full-page view)
3. Use the **Summary** tab to assign meetings to projects
4. View project totals in the **Project Hours** tab
5. In the **Settings** tab or full Settings page, enter your Everhour API token and each project's task ID
> Tip: Add custom **keywords** when creating projects to auto-link new meetings in future weeks.

## 🗂 Tabs Overview

- **Summary** – See and tag this week’s meetings
- **Project Hours** – View total hours per project (weekly or daily)
- **Settings** – Create, rename, color, reorder, group, or delete projects and keywords

## 💾 Installation

1. Clone this repo or download as ZIP
2. Go to `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load unpacked**
5. Select the folder with this extension

## ✅ Requirements

- Must be used on the **Google Calendar web app**
- Must be in **Week View** for detection to work

## 🔑 Everhour Setup

1. Open the **Settings** tab of the popup.
2. Enter your Everhour API token and click **Save**.
3. For each project, set its Everhour task ID.
4. Click **Add to Everhour** next to a meeting to log its time via the `/tasks/{id}/time` endpoint.

## 🧪 Running Tests

Run `node test.js` to check script syntax and sample parsing. Node.js must be installed.

## Development Notes

- Duplicated styles in `popup.html` and `options.html` were consolidated into a shared
  `styles.css` file to simplify maintenance.

## 👤 Author
GitHub: [@Stem0794](https://github.com/Stem0794)

---

## License

MIT
