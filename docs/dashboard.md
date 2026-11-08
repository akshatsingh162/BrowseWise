# Dashboard architecture

The dashboard is a single extension page (`src/dashboard/dashboard.html`) with a hash router. It only reads data; the service worker is the only thing that records time.

## Structure

| File                      | Role                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| `dashboard.js`            | Entry point. Loads styles and calls `startDashboard`.                        |
| `app.js`                  | `startDashboard(root)`: builds the shell, routes pages, returns `{ stop }`.  |
| `router.js`               | Route list, `parseRoute`, and a hash-change router.                          |
| `shell.js`                | Sidebar navigation and the main content region.                              |
| `data.js`                 | Loads and aggregates stored usage for each page.                             |
| `components/data-view.js` | Loading, error, and ready states, live refresh, and out-of-order protection. |
| `components/*`            | Stat card, usage list, segmented control, page header, state card.           |
| `pages/*`                 | One module per page. Unbuilt pages use an honest "Coming soon" placeholder.  |

## Page contract

A page is `mountXPage(container, deps)` and returns `{ unmount }`. The router calls `unmount` before mounting the next page, so timers and storage subscriptions never leak.

## Data flow

1. A page mounts and `data-view` draws stored data immediately.
2. It then asks the service worker to flush the in-progress interval (`GET_LIVE_SNAPSHOT`) and redraws silently.
3. While the page is open it refreshes every 30 seconds and whenever any `usage:*` record changes in storage.
4. Responses can arrive out of order, so only the newest request may update the screen. A failed silent refresh keeps the last good data.
5. A silent refresh that returns data identical to what is on screen changes nothing, so an idle page never flickers or loses focus. (The dashboard is not a tracked page, so the data usually does not change while you are looking at it.)
6. Pages with charts set `flushFirst`: they flush before the first draw and draw once, so the entry animation is not cut short by a second redraw.

A page's render function may return `{ node, mounted, destroy }`: `mounted` runs once the node is in the page (charts need real dimensions) and `destroy` runs before the node is replaced, so charts are never leaked.

Page controls (search box, range switch) live outside the data region, so refreshes never reset what the user typed.

## Definitions

- **Screen time today:** sum of all domains recorded today.
- **Comparison:** today so far versus yesterday up to the same time of day, so a morning is not compared with a full previous day.
- **Daily average:** mean of the previous 7 days that have recorded time. Today is excluded because it is still in progress, and days with no data are not counted as zero.
- **Share (%):** a site's time divided by the total for the selected range.

## Adding a page

1. Add the route to `ROUTES` in `router.js` (with an icon registered in `src/ui/icons.js`).
2. Create `pages/<name>.js` exporting `mount<Name>Page(container, deps)`.
3. Register it in `PAGES` in `app.js`.

## Known gaps

- There is no "skip to content" link: a `#` link would collide with hash routing. Focus moves into the content area after each navigation instead.
- Charts are redrawn (not updated in place) when new data arrives. Because the dashboard is not tracked, this only happens when other tabs accrue time.
