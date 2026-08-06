# Chrome Web Store Listing — Weekly Calendar Project Tracker

> Last Updated: 2026-07-30

## Store Listing

**Extension Name**
Weekly Calendar Project Tracker

**Short Description**
Track, color-code, and export your Google Calendar meetings and project hours by week or day.

**Detailed Description**
Weekly Calendar Project Tracker is a lightweight extension that helps you track and summarize your Google Calendar meetings by project. It auto-detects meetings, links them to projects, and lets you quickly log time to Everhour.

Key Features:
- Detects meetings from Google Calendar week view.
- Works with Google Calendar in English, French, and Spanish.
- Assign meetings to projects and color-code them.
- Auto-link recurring meetings using custom keywords.
- View total hours per project, day, or week.
- Send logged time directly to Everhour.
- Export and import settings (excluding API token).

How to Use:
1. Open Google Calendar in Week View.
2. Click the extension icon or open side panel to view the tracking interface.
3. Assign meetings to projects in the Summary tab.
4. Enter your Everhour API token in the Settings tab to sync hours.

Privacy and Permissions:
This extension processes your data locally on your device. Your settings and calendar events are stored locally and are only transmitted to the official Everhour API if you configure and use the time logging feature.

**Category**
Productivity

**Single Purpose**
Summarizes and tracks Google Calendar meetings by project and logs hours to Everhour.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | icon.png |
| Screenshot 1 | 1280×800 | ⬜ Not created | |
| Screenshot 2 | 1280×800 | ⬜ Not created | |

### Screenshot Notes
- Screenshot 1 should display the main "Summary" tab of the extension in the side panel alongside a Google Calendar in week view, demonstrating meeting detection.
- Screenshot 2 should show the "Project Hours" summary tab displaying total calculated hours per project.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| activeTab | permissions | Required to read and parse meeting events from the currently active Google Calendar tab. |
| storage | permissions | Required to store user settings, projects list, keyword assignments, and the Everhour API token locally. |
| sidePanel | permissions | Required to present the extension interface inside Chrome's built-in side panel. |
| notifications | permissions | Required to display browser notifications confirming that a time entry has been successfully logged. |
| alarms | permissions | Required to manage background status checks and event scheduling. |
| https://api.everhour.com/* | host_permissions | Required to communicate with the Everhour API in order to log hours to user tasks. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Authentication info | Yes | Yes | Used to authenticate API requests to Everhour to log meeting hours. | No |
| Website content | Yes | Yes | Reads Google Calendar event details locally to compute hours; sends user-selected entries to Everhour. | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://github.com/Stem0794/calendar_extension_everhour/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name**
Stem0794

**Contact Email**
theodore.konikowski@example.com

**Homepage URL**
https://github.com/Stem0794/calendar_extension_everhour

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 4.3.0 | 2026-07-30 | Redesigned side panel and settings UX; improved responsive and dark-mode layouts; fixed suggested-entry logging, filtered totals, empty-tab handling, duplicate project validation, and backup validation. | Ready to upload |
| 4.2.1 | 2026-06-29 | Allow suggested entries to be logged directly without reselecting their project. | Superseded |
| 4.2.0 | 2026-06-04 | Prepare for Chrome Web Store update. | Draft |
| 4.1.0 | 2026-06-03 | Previous release. | Published |

## Review Notes

### Known Issues / Limitations
- Must be in Week View on Google Calendar for event detection to operate.
