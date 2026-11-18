# Distribution: GitHub only

BrowseWise is distributed from GitHub. It is **not** published on the Chrome Web Store. Anyone can read the source, build it, or download a release and load it into Chrome in developer mode.

## Why this works, and what it means

Chrome documents two ways to install an extension that is not from the Web Store: **developer mode** (the "Load unpacked" button) and enterprise policy. A normal user cannot install a packed `.crx` file from a website on Windows or macOS. So BrowseWise is installed by loading its folder:

- There is **no automatic update**. Updating is a manual step (below).
- There is **no store review**. Anyone who installs BrowseWise should be able to read its source, which is open (MIT).
- Chrome may show a message about developer-mode extensions when it starts. That is Chrome's standard behaviour for any extension loaded this way and is not specific to BrowseWise. The exact wording and behaviour were not tested for this guide.
- The install warning shown by Chrome is still the one line "Read your browsing history", from the `tabs` permission. The permissions are explained in [permissions.md](permissions.md).

## Installing

1. Download the latest release zip from the repository's **Releases** page.
2. Extract it into a folder you will **keep** (for example `Documents\BrowseWise`). Chrome loads the extension from that folder every time it starts, so do not delete or move it.
3. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
4. Choose **Load unpacked** and select the folder that contains `manifest.json`.
5. Pin the BrowseWise icon from the puzzle-piece menu if you want it in the toolbar.

To build it yourself instead: `npm ci`, then `npm run build`, then load the `dist` folder.

## Updating

1. **Export your data first** (Settings → Your data), as a precaution.
2. Extract the new release over the files in the **same folder**, replacing the old ones.
3. On `chrome://extensions`, press the reload (circular arrow) button on the BrowseWise card.

Two things to avoid:

- **Do not press Remove.** Removing an extension deletes the data it stored. Chrome's documentation says an extension's storage is cleared when it is removed.
- **Loading the new version from a different folder** may create a second copy of the extension with a different ID and its own empty storage, because Chrome derives an unpacked extension's ID from its folder path unless the manifest fixes it with a `key`. This behaviour was not tested here. Fixing the ID with a `key` is planned for the release phase so that a folder change cannot lose data; it changes the ID once, so it will be done before the first public release.

## For the maintainer

A release is a git tag plus a zip of the built extension:

1. Bump `version` in `package.json` and `public/manifest.json`, and tag it (`v0.1.0`).
2. `npm ci`, `npm run build`, then zip the **contents** of `dist` (so `manifest.json` is at the top of the zip).
3. Publish a GitHub Release with the zip and its SHA-256 checksum, so users can check the download.
4. Describe what changed in the release notes (the privacy policy says changes to data handling are noted there).

GitHub Pages can host a landing page and the privacy policy, but unlike a store listing nothing requires them.

## What this removed from the plan

These were only needed for the Chrome Web Store and are dropped: the paid developer account, the listing text and screenshots, the single-purpose statement, the data-use disclosures form, store review, and the padded 128 px store icon. The permission explanations stay, because users should still be able to see why each permission exists.

## Possible later additions

- A link in Settings that opens the Releases page, so users can check for a new version. It would only open a page in a tab when clicked; the extension would still make no network requests of its own.
- Checking that the release zip loads cleanly on a machine that has never run the project.
