# Focus timer, streaks, and badges

Design notes for the Focus page, the popup timer, and the streaks and badges (Phase 10).

## What it is

A simple timer for focused work and breaks. It counts clock time and nothing else: it does not look at what you do during a session, and it never blocks anything. Completed sessions feed streaks and badges, which can be hidden completely.

## The timer

A **phase** is one stretch of the cycle: a focus session, a short break, or a long break. Each is `ready` (chosen, not started), `running`, or `paused`.

| Setting                            | Default | Allowed   |
| ---------------------------------- | ------- | --------- |
| Focus session (minutes)            | 25      | 5 to 120  |
| Short break (minutes)              | 5       | 1 to 30   |
| Long break (minutes)               | 15      | 1 to 60   |
| Long break after (sessions)        | 4       | 2 to 8    |
| Start the next phase automatically | off     | on or off |
| Show streaks and badges            | on      | on or off |

Sessions shorter than 5 minutes are not offered, so that badges mean something.

After a focus session comes a short break, or a long break after every fourth session. After a break, the next focus session is offered. By default each phase waits for you to start it, so a break is never missed by accident; "start the next phase automatically" changes that.

### How it keeps time

The timer never counts ticks. A running phase stores the moment it will end (`endsAt`), and everything on screen is computed from that and the clock. So it stays correct when the popup closes, the tab is in the background, the service worker is suspended, or Chrome restarts. Pausing stores the time left; resuming sets a new end time from it.

If the system clock is changed while a phase runs, the timer follows the clock. Moving it back never shows more than the planned length; moving it forward can end a phase early. The timer measures elapsed clock time, not attention, and a computer that sleeps mid-session still counts the time that passed.

### One writer

Only the service worker changes timer state. The dashboard and the popup send it a command (`start`, `pause`, `resume`, `stop`, `skip`, or `sync`) and show what comes back, so two tabs and the popup can never disagree. Commands run inside the worker's task queue, in order with tracking. A command the user can reasonably send but that cannot be done (skipping a focus session) is answered with a clear message and is not logged as a fault.

### Finishing a phase

Chrome limits `chrome.alarms` to once every 30 seconds and may delay them, so completion does not rely on one alarm being on time. A finished phase is settled by whichever comes first:

1. the phase's own alarm (set for `endsAt`, removed when paused or stopped),
2. the 30-second heartbeat that already drives tracking,
3. any command or `sync` from an open dashboard or popup (which also asks the moment the countdown reaches zero).

Settling is idempotent: once a phase has been settled it is no longer due, so settling it again changes nothing.

**Finishing writes the new timer state and the day's session count in a single storage call.** If the worker were interrupted between two separate writes, the same session could be counted twice on the next wake. With one write, either everything happened or nothing did. A test makes the write fail and checks that a retry counts the session exactly once.

A session is filed under the day it **ended**, not the day the worker noticed. A session that ends at 23:45 and is noticed at 00:20 belongs to the first day.

If the worker only notices a finished phase long after it ended (computer asleep for hours), the session is still counted but no notification is shown, because it would be stale. With "start the next phase automatically" on, the next phase starts when it was noticed, not back-dated, so a late wake never chains several phases.

## Streaks

| Streak           | Counts                                                         |
| ---------------- | -------------------------------------------------------------- |
| Focus streak     | Days in a row with at least one completed focus session.       |
| Within your goal | Days in a row within the daily goal you set on the Goals page. |

- **Today never ends a streak.** A streak that ran up to yesterday is still alive while today has no session yet; only a whole day without one ends it.
- **Within your goal** counts only finished days. A day with no recorded time, or with no goal set at the time, is skipped: it neither extends the streak nor ends it. Going over the goal ends it. Skipped days mean a long gap is not rewarded as a long streak: only days that were actually within the goal are counted.
- Each finished day is checked against the goal **when the day is closed**, normally the next day. If the browser was closed for a while, the day is checked against the goal at the later time.
- Best streaks are stored, so they survive the retention setting deleting old days.

A streak that ends is shown as a neutral number next to the best one. There is no warning, no loss message, and no reminder.

## Badges

Badges are earned once and kept. They come only from things you chose to do: completing sessions, and staying within a goal you set yourself. Using the browser more or less is never scored.

| Badge                    | Tier   | Earned by                              |
| ------------------------ | ------ | -------------------------------------- |
| First focus              | Bronze | Completing a focus session             |
| Finding a rhythm         | Bronze | 10 sessions                            |
| In the zone              | Silver | 50 sessions                            |
| Deep work                | Gold   | 200 sessions                           |
| First hour               | Bronze | 1 hour of focus in total               |
| Ten hours                | Silver | 10 hours in total                      |
| Fifty hours              | Gold   | 50 hours in total                      |
| Full set                 | Silver | 4 sessions in one day                  |
| Long haul                | Silver | One session of 45 minutes or more      |
| Three in a row           | Bronze | A 3-day focus streak                   |
| A full week              | Silver | A 7-day focus streak                   |
| A month of focus         | Gold   | A 30-day focus streak                  |
| A week within your goal  | Silver | 7 days in a row within the daily goal  |
| A month within your goal | Gold   | 30 days in a row within the daily goal |

Tiers are written as words as well as shown in colour. A locked badge says "Locked" and shows how close you are.

When a badge is earned while the Focus page is open, a short confetti burst plays (inside the visible window, and not at all with reduced motion), the new badge is announced to screen readers, and it is also shown as text. If notifications are on, a "New badge" notification is shown.

## Hiding it

**Settings → Focus timer → Show streaks and badges** hides the streaks, the badges, and badge notifications completely. Nothing is deleted, and turning it back on shows everything again. The timer itself and the plain focus numbers stay.

## Data

| Key                   | Contents                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `focusState`          | The current phase, or `null`: phase, status, length, time left or end time, count in the set. |
| `focusDay:YYYY-MM-DD` | One record per day: sessions, focus milliseconds, the longest session.                        |
| `achievements`        | Badges earned (with the day), best streaks, each finished day's goal result, last day closed. |

No free text is stored: there are no session names or notes.

- **Retention:** focus days older than the retention setting are deleted with the browsing days. Earned badges and best streaks stay.
- **Clear history** deletes focus days and the achievements (they are built from that history). A timer running right now is left alone.
- **Delete everything** removes all of it, including a running timer and its alarm.
- **Export:** the JSON file has a `focus` section (days, badges earned, best streaks). It is additive, so `exportFormat` stays 1. The CSV is unchanged.

## Known limitations

- The timer counts clock time. It cannot know whether you stayed at the computer, or whether the machine slept.
- A phase can finish up to about 30 seconds late (alarm granularity). The countdown shows 0:00 immediately and the result appears once the worker settles it.
- Changing the system clock changes the timer (see above).
- Goal results use the goal in force when a day is closed, which is not always the goal you had on that day if the browser was closed for days.
- While the popup is open, Chrome moves focus to it, which pauses browsing-time tracking (not the focus timer).
