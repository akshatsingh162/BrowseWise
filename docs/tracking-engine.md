# Tracking engine

How BrowseWise measures active browsing time, and where the measurement is imperfect.

## Design

| File                               | Role                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `src/background/tracker.js`        | Pure state machine. No Chrome APIs, no clock. Decides what time is countable.    |
| `src/background/sync.js`           | Reads the real browser state from Chrome, runs the tracker, persists the result. |
| `src/background/session-store.js`  | Saves and loads the tracker state so it survives service-worker suspension.      |
| `src/background/service-worker.js` | Registers Chrome event listeners and runs events one at a time through a queue.  |

### Accounting rule

Time is never counted by a ticking timer. The tracker stores `checkpointTs`, the last moment already accounted for. On every event it does two steps in a fixed order:

1. **Flush**: using the previous state, credit `[checkpointTs, now)` if it was countable.
2. **Mutate**: apply the newly observed state and move the checkpoint to `now`.

Because every millisecond is credited at most once, to the state that was true during it, time cannot be double counted.

### What counts

Time is credited only when all of these hold:

- the active tab of the focused Chrome window has a trackable `http(s)` URL,
- a Chrome window has operating-system focus,
- the user is not idle or locked (optional exception: an audible tab may count while idle, never while locked),
- the tab is not incognito.

### Events are hints, not data

Whatever event fires, `sync.js` asks Chrome what is actually focused, active and idle right now. A missed or reordered event is repaired by the next event or by the 30-second heartbeat alarm.

### Surviving service-worker suspension

The worker can be stopped at any time. No tracking state lives in memory: each event loads state from `chrome.storage.local`, updates it, and saves it. Listeners are registered synchronously at the top level so Chrome can wake the worker for the event.

### Protection rules

- A gap longer than 120 s between checkpoints is discarded (sleep, Chrome closed, clock jump).
- If the clock moves backwards, nothing is credited.
- At browser startup the checkpoint is reset, so the time Chrome was closed is never credited.
- The checkpoint is saved before usage is written. A crash between the two loses at most one interval instead of counting it twice.

## Honest limitations

- **This measures active browsing time, not attention.** Chrome's Idle API detects keyboard and mouse input across the whole system. Reading a long page without touching the input devices eventually registers as idle.
- **Idle overcount.** Chrome reports "idle" only after the threshold has passed, so up to one threshold (60 s by default) of no-input time is counted before the user is marked idle.
- **Stored totals lag by up to about 30 s.** Usage is written when an event or heartbeat occurs. The popup will request a live flush in a later phase.
- **Short sleeps.** A sleep shorter than 120 s may be counted as activity.
- **Setting changes** are applied to the interval since the previous event, so the effect can be retroactive by up to one heartbeat.
- **Subdomains are separate rows** (`mail.google.com` and `docs.google.com`).
- **DevTools windows** are not tracked as websites.
