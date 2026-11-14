# BrowseWise Privacy Policy

_Draft for version 0.1.0. Last updated: 15 November 2026._

BrowseWise is a Chrome extension that shows how much active time you spend on each website. It is built to work entirely on your own computer.

## The short version

- BrowseWise stores its data **only on your device**, in Chrome's extension storage.
- BrowseWise **does not send any data anywhere**. It has no server, no account, no analytics, and no advertising.
- BrowseWise **never reads or stores** web page content, anything you type, or passwords.
- You can **export** or **delete** all of your data at any time from the Settings page.

## What BrowseWise stores

On your device, BrowseWise keeps:

- **Websites and time.** For each day, the **domain** of each website you used (for example `youtube.com`) and the number of active seconds spent on it, in total and per hour of the day.
- **Your choices.** Settings, goals and limits you set, and any website category you changed.
- **Working state.** The website being tracked right now, whether you are idle, the time of the last save, which limit notifications were already sent today, and the day housekeeping last ran. This lets tracking carry on correctly after Chrome restarts.

## What BrowseWise does not store

- Full web addresses (only the domain is kept), page titles, or page content.
- Anything you type into a page, including passwords and form fields.
- Anything from private (Incognito) windows. BrowseWise ignores them, even if you allow the extension there.
- Website icons. Chrome keeps those; BrowseWise only displays them.
- Your browsing history. BrowseWise never uses Chrome's history API and cannot read pages you visited before it was installed.

## How tracking works

BrowseWise looks at the tab you are currently using in the window you are currently using, and records its domain and how long it stays active. Time is not counted while you are idle, the screen is locked, or Chrome is not the focused window. BrowseWise measures **active browsing time**. It does not measure attention, and website categories describe the website, not what you were doing there.

## Permissions

| Permission                 | Why                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `storage`                  | Save your data on your device.                                                                 |
| `tabs`                     | Read the domain of the tab you are using, and open the dashboard.                              |
| `idle`                     | Stop counting time while you are idle or the screen is locked.                                 |
| `alarms`                   | Save progress regularly.                                                                       |
| `favicon`                  | Show website icons from Chrome's own cache.                                                    |
| `notifications` (optional) | Show a reminder when you reach a goal or limit. Asked for only when you turn notifications on. |

Chrome describes the `tabs` permission as "Read your browsing history". BrowseWise uses it only for the tab you are currently using, and never reads past history.

## Sharing

BrowseWise does not share, sell, or transfer your data to anyone, and does not use it for any purpose other than showing it to you.

## Exports

When you choose **Export**, BrowseWise creates a file that your browser saves to your computer like any download. The file contains the domains you visited and the time spent, so keep it as private as you would any record of your browsing. BrowseWise does not upload it.

## Keeping and deleting your data

- By default BrowseWise keeps up to one year of history and deletes older days automatically. You can choose a different length in Settings.
- **Clear history** deletes all recorded time. **Delete everything** deletes all of BrowseWise's data and resets its settings.
- Uninstalling the extension removes its stored data, because Chrome clears an extension's storage when it is removed.

## Children

BrowseWise does not knowingly collect any information from anyone. It collects nothing remotely.

## Changes to this policy

If BrowseWise ever changes how it handles data, this policy will be updated before the change is released, and the change will be described in the release notes.

## Contact

Questions or concerns: open an issue at <https://github.com/akshatsingh162/BrowseWise/issues>.
