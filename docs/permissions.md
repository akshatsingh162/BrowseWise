# Permissions

BrowseWise requests only what its code uses today. Nothing is requested "just in case".

| Permission | Why it is needed                                                                 | Used by                           |
| ---------- | -------------------------------------------------------------------------------- | --------------------------------- |
| `storage`  | Save usage, settings, and tracker state on this device.                          | Every part of the extension       |
| `tabs`     | Read the active tab's URL to learn its domain. Also used to focus the dashboard. | Tracking engine, "Open dashboard" |
| `idle`     | Know when the user is idle or the screen is locked, so that time is not counted. | Tracking engine                   |
| `alarms`   | Wake the service worker every 30 seconds to save progress.                       | Tracking engine heartbeat         |
| `favicon`  | Show website icons from Chrome's own favicon cache.                              | Popup and dashboard lists         |

## Deliberately not requested

`history` / `browsingHistory`, host permissions (`<all_urls>`), `activeTab`, `scripting`, `webRequest`, `cookies`, `unlimitedStorage`, and `notifications` (requested later, only when the notifications feature ships).

## What Chrome shows at install

Observed in Chrome on Windows with the current build: a single line, **"Read your browsing history"**. The `favicon` permission added no extra line.

That wording comes from the `tabs` permission. BrowseWise never calls the History API and never reads past history. It sees only the tab you are currently using, stores only the **domain** and the time spent, and sends nothing anywhere. This explanation belongs in the README, the store listing, and the privacy policy.

## Data stored locally

- Per day: seconds per domain and per hour of day.
- Settings and the tracker's current state (domain in focus, idle state, last checkpoint time).

Not stored: full URLs, page titles, page content, form inputs, passwords, or favicon images.
