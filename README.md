<p align="center">
  <img src="docs/assets/logo.png" alt="BrowseWise logo" width="96" height="96" />
</p>

<h1 align="center">BrowseWise</h1>

<p align="center">Privacy-first screen-time and digital wellbeing tracking for Google Chrome.</p>

> **Status:** In development. BrowseWise is distributed from GitHub only. See [Distribution](docs/distribution.md) for how to install and update it.

BrowseWise measures how much active time you spend on each website and shows it in a local analytics dashboard. Everything stays on your device: no accounts, no servers, no analytics.

## Built so far

- Active-tab screen-time tracking with focus, idle, and lock detection
- A compact popup with live numbers
- A dashboard with Overview, Websites, History, and Analytics (daily, weekly, and monthly charts)
- Automatic website categories with manual overrides
- A daily goal and per-website limits with optional notifications (BrowseWise only reminds you, it never blocks anything)

- A modern dark interface: layered gradients, a fine grid and film grain, glass-style cards, and subtle parallax that is switched off for people who prefer reduced motion
- No sidebar: a floating navigation dock (it hides while you scroll, and number keys 1 to 7 jump between pages) gives the content the whole window
- History by day, by week, and for a single website, with a link from any day to its detailed analytics
- A Settings page: idle threshold, tracking switches, and how long history is kept
- CSV and JSON export, and separate buttons to clear history or delete everything
- A focus timer with breaks, on its own page and in the popup, that keeps running when the tab is closed
- Optional streaks and badges for completed focus sessions and for staying within your own daily goal (never for using the browser more or less), which can be hidden completely

## Planned

- Hardening and a full manual test pass, then release packaging for GitHub

## Install

BrowseWise is not on the Chrome Web Store. Download a release from GitHub, extract it to a folder you will keep, and load it with **Load unpacked** in `chrome://extensions` (Developer mode on). Step-by-step instructions, and how to update without losing your data, are in [Distribution](docs/distribution.md).

## A note on what "screen time" means

BrowseWise measures **active browsing time**: time the Chrome window is focused, the tab is in the foreground, and you are not idle. It does not measure attention or intent. Website categories describe the website, not what you were doing there.

## Documentation

- [Tracking engine](docs/tracking-engine.md)
- [Dashboard architecture](docs/dashboard.md)
- [Analytics](docs/analytics.md)
- [Categories](docs/categories.md)
- [Goals and limits](docs/goals.md)
- [History, export, and data deletion](docs/history-and-data.md)
- [Focus timer, streaks, and badges](docs/focus-and-achievements.md)
- [Distribution (install and update)](docs/distribution.md)
- [Privacy policy](docs/privacy-policy.md)
- [Visual design](docs/visual-design.md)
- [Permissions](docs/permissions.md)
- [Design system](docs/design-system.md) and [branding](docs/branding.md)
- [Manual testing](docs/manual-testing.md)

## License

[MIT](LICENSE)
