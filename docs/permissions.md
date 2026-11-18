# Permissions

BrowseWise requests only what its code uses today. Nothing is requested "just in case".

| Permission | Why it is needed                                                                 | Used by                           |
| ---------- | -------------------------------------------------------------------------------- | --------------------------------- |
| `storage`  | Save usage, settings, and tracker state on this device.                          | Every part of the extension       |
| `tabs`     | Read the active tab's URL to learn its domain. Also used to focus the dashboard. | Tracking engine, "Open dashboard" |
| `idle`     | Know when the user is idle or the screen is locked, so that time is not counted. | Tracking engine                   |
| `alarms`   | Wake the service worker every 30 seconds to save progress.                       | Tracking engine heartbeat         |
| `favicon`  | Show website icons from Chrome's own favicon cache.                              | Popup and dashboard lists         |

## Optional permission

| Permission      | Why it is needed                                             | When Chrome asks                      |
| --------------- | ------------------------------------------------------------ | ------------------------------------- |
| `notifications` | Show a desktop notification when a goal or limit is reached. | Only when you switch notifications on |

It is declared under `optional_permissions`, so it is **not** requested at install and adds no install warning. BrowseWise removes it again when you switch notifications off.

## Deliberately not requested

`history` / `browsingHistory`, host permissions (`<all_urls>`), `activeTab`, `scripting`, `webRequest`, `cookies`, `unlimitedStorage`.

## What Chrome shows at install

Observed in Chrome on Windows with the current build: a single line, **"Read your browsing history"**. The `favicon` permission added no extra line.

That wording comes from the `tabs` permission. BrowseWise never calls the History API and never reads past history. It sees only the tab you are currently using, stores only the **domain** and the time spent, and sends nothing anywhere. This explanation belongs in the README, the store listing, and the privacy policy.

## Data stored locally

All of it is in `chrome.storage.local`, on this device. Chrome limits that area to about 10 MB; BrowseWise does not request `unlimitedStorage`. Chrome removes it when the extension is uninstalled.

| Key                   | Contents                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| `usage:YYYY-MM-DD`    | Per day: milliseconds per domain and per hour of day.                                 |
| `settings`            | Idle threshold, two tracking switches, the notifications switch, and the retention.   |
| `meta`                | The schema version, used for safe migrations.                                         |
| `tracker:state`       | Domain in focus, idle state, and last checkpoint time, so tracking survives restarts. |
| `categoryOverrides`   | Domain-to-category pairs you chose.                                                   |
| `goals`               | The daily goal and per-website limits.                                                |
| `limitNotices`        | Which limits already sent a notification today.                                       |
| `maintenance`         | The date the retention clean-up last ran.                                             |
| `focusState`          | The focus timer's current phase, or null. No text.                                    |
| `focusDay:YYYY-MM-DD` | Per day: completed focus sessions, their total time, and the longest.                 |
| `achievements`        | Badges earned, best streaks, and each finished day's goal result.                     |

Not stored: full URLs, page titles, page content, form inputs, passwords, anything from Incognito windows, or favicon images.

## The focus timer needs no new permission

It uses `alarms` (already requested) to wake the service worker when a phase ends, and `storage`. Focus and badge notifications use the same optional `notifications` permission as goals, and only if notifications are turned on. See [Focus timer, streaks, and badges](focus-and-achievements.md).

## Export needs no permission

**Export JSON** and **Export CSV** build the file in the Settings page and hand it to the browser as a normal download (a `Blob` and a temporary link). No `downloads` permission is needed, and nothing is sent anywhere.

## Deleting data

**Clear history** and **Delete everything** (Settings → Your data) are described in [History, export, and data deletion](history-and-data.md). Deleting everything also removes the optional `notifications` permission, because the reset setting turns notifications off.

See the [privacy policy](privacy-policy.md) for the user-facing wording.
