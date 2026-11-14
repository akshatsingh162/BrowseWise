<p align="center">
  <img src="docs/assets/logo.png" alt="BrowseWise logo" width="96" height="96" />
</p>

<h1 align="center">BrowseWise</h1>

<p align="center">Privacy-first screen-time and digital wellbeing tracking for Google Chrome.</p>

> **Status:** 🚧 In development. Not yet available on the Chrome Web Store.

BrowseWise measures how much active time you spend on each website and shows it in a local analytics dashboard. Everything stays on your device: no accounts, no servers, no analytics.

## Built so far

- Active-tab screen-time tracking with focus, idle, and lock detection
- A compact popup with live numbers
- A dashboard with Overview, Websites, History, and Analytics (daily, weekly, and monthly charts)
- Automatic website categories with manual overrides
- A daily goal and per-website limits with optional notifications (BrowseWise only reminds you, it never blocks anything)

- History by day, by week, and for a single website, with a link from any day to its detailed analytics
- A Settings page: idle threshold, tracking switches, and how long history is kept
- CSV and JSON export, and separate buttons to clear history or delete everything

## Planned

- Hardening and a full manual test pass, release packaging, and a Chrome Web Store listing

## A note on what "screen time" means

BrowseWise measures **active browsing time**: time the Chrome window is focused, the tab is in the foreground, and you are not idle. It does not measure attention or intent. Website categories describe the website, not what you were doing there.

## Documentation

- [Tracking engine](docs/tracking-engine.md)
- [Dashboard architecture](docs/dashboard.md)
- [Analytics](docs/analytics.md)
- [Categories](docs/categories.md)
- [Goals and limits](docs/goals.md)
- [History, export, and data deletion](docs/history-and-data.md)
- [Privacy policy](docs/privacy-policy.md)
- [Permissions](docs/permissions.md)
- [Design system](docs/design-system.md) and [branding](docs/branding.md)
- [Manual testing](docs/manual-testing.md)

## License

[MIT](LICENSE)
