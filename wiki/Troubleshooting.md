# Troubleshooting

Common issues and how to resolve them.

## Events not appearing

If your calendar events are not showing up in the extension:

1. **Check your View**: Ensure you are in **Week View** in Google Calendar. The extension only scrapes events from the week view container.
2. **Refresh**: Sometimes the extension needs a page reload (`Cmd+R` or `F5`) to re-attach to the calendar DOM, especially if you've just installed it.
3. **Language**: Ensure your Google Calendar interface language is set to **English**, **French**, or **Spanish**. Other languages are not currently supported.

## "Declined" events are missing

The extension automatically filters out events that you have declined or marked as "No" to prevent them from cluttering your project hours.

## "Error" when clicking the checkmark

If clicking the **Add to Everhour** button results in an "Error":

1. **Check API Token**: Go to **Settings** and ensure your Everhour API token is correct.
2. **Check Task ID**: Ensure the project you selected has a valid Everhour Task ID in the **Settings > Projects** list.
3. **Network**: Verify you have an internet connection and that `api.everhour.com` is reachable.

## Still stuck?

If you encounter an issue not listed here, please open an issue on the GitHub repository.
