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
- A dashboard with Overview, Websites, and Analytics (daily, weekly, and monthly charts)
- Automatic website categories with manual overrides

## Planned

- Daily goals and per-website limits with optional notifications
- Settings, history, CSV and JSON export, and one-click data deletion

## A note on what "screen time" means

BrowseWise measures **active browsing time**: time the Chrome window is focused, the tab is in the foreground, and you are not idle. It does not measure attention or intent. Website categories describe the website, not what you were doing there.

## Documentation

- [Tracking engine](docs/tracking-engine.md)
- [Dashboard architecture](docs/dashboard.md)
- [Analytics](docs/analytics.md)
- [Categories](docs/categories.md)
- [Permissions](docs/permissions.md)
- [Design system](docs/design-system.md) and [branding](docs/branding.md)
- [Manual testing](docs/manual-testing.md)

## License

[MIT](LICENSE)
