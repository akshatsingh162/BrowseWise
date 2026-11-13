# Goals and limits

BrowseWise can remind you when you reach a daily browsing goal or a limit on a single website. It **only measures and reminds. It never blocks, hides, or closes anything.**

## What you can set

| Setting       | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| Daily goal    | A limit for your total active browsing time each day.          |
| Website limit | A daily limit for one website. Up to 100 websites.             |
| Notifications | Optional desktop notification when a goal or limit is reached. |

Goals and limits are between **5 minutes and 24 hours**. Anything outside that range is rejected with a message rather than silently changed.

## What "reached" means

A limit counts as reached when time used today is **at or above** the limit. The page shows three states, always in words as well as colour:

- **On track:** under 80% of the limit.
- **Nearly reached:** 80% or more, with the time left shown.
- **Reached:** shown as "Limit reached" or "Over by 25m".

Time is the same active time measured everywhere else (focused window, foreground tab, not idle). A website's time is for that exact domain, as listed on the Websites page.

## Notifications

- **One per limit per day.** The first time a goal or limit is reached, you get one notification. It resets on a new day.
- **Neutral wording.** For example "youtube.com limit reached. You have spent 31m on youtube.com today. Your limit was 30m."
- **Clicking a notification opens the Goals page.**
- **Setting a limit you are already over does not notify.** You can see you are over it. Changing a limit starts fresh: if the new limit has not been reached yet, it can notify when it is.
- **Turning notifications on does not announce limits you have already passed.**
- **Delivery depends on your system.** Chrome hands the notification to the operating system. On Windows, Focus assist or Do not disturb, or blocked Chrome notifications in system settings, can hide it. Use "Send a test notification" to check.
- **Timing.** Limits are checked whenever tracking updates, including every 30-second heartbeat, so a notification can arrive up to about 30 seconds after the limit is reached.

## The notifications permission

`notifications` is an **optional permission**. It is not requested at install and adds no install warning. Chrome asks for it only when you switch notifications on, and BrowseWise gives it back when you switch them off. If the permission is removed in Chrome, the page shows notifications as off and explains why.

## How it works

| File                                     | Role                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `src/shared/limits.js`                   | Pure rules: validation, status, wording, and which limits are newly reached. |
| `src/shared/storage/goals-repo.js`       | Saves goals, and the once-per-day notification record.                       |
| `src/background/limits-monitor.js`       | Runs after each tracking update and notifies when needed.                    |
| `src/shared/notifier.js`                 | Shows notifications, only if the permission is held.                         |
| `src/shared/notifications-permission.js` | Asks for, checks, and removes the optional permission.                       |
| `src/dashboard/pages/goals.js`           | The Goals & limits page.                                                     |

The limit check runs separately from tracking and is guarded: if it ever fails, tracking has already been saved and nothing is lost.

## Stored data

- `goals`: the daily goal and the per-website limits.
- `limitNotices`: which limits already notified today (for one day only).
- `settings.notificationsEnabled`: the on/off choice.

All optional keys with safe defaults, so no schema migration was needed.

## Known limitations

- **Limits are per exact domain.** `mail.google.com` and `docs.google.com` are separate, as everywhere in BrowseWise.
- **No blocking by design.** A notification is the only consequence of reaching a limit.
- **Active time, not attention.** See the tracking engine notes for what is and is not counted.
- **Notifications need the permission and system support.** Without them the progress is still shown on the page.
