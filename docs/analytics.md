# Analytics

The Analytics page has three views, switched with the Daily / Weekly / Monthly control.

| View    | Shows                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------- |
| Daily   | Any single day: total, websites, busiest hour, active hours, an hour-by-hour bar chart, websites. |
| Weekly  | The last 7 days beside the 7 days before, grouped by weekday, plus the most-used websites.        |
| Monthly | A 30-day trend line, totals for the last 6 calendar months, and the most-used websites.           |

## Design decisions

- **Charts for time series, lists for rankings.** Rankings are easier to read as text with favicons, and the design uses a single accent colour rather than a multi-coloured pie.
- **Interactive.** Hovering shows exact durations. Clicking a bar in the weekly chart or a point in the 30-day chart opens that day in the Daily view. Keyboard users reach any day with the day arrows.
- **Accessible.** Each canvas is labelled as an image, and the same numbers are provided as a visually hidden table. Chart animation follows the operating-system "reduce motion" setting.
- **Honest scales.** The hourly chart always runs 0 to 60 minutes, because an hour cannot hold more.

## Definitions

- **Active hours:** hours with at least one minute of activity (stray seconds do not count).
- **Daily average:** the mean over days that have data. Days with nothing recorded are not counted as zero.
- **Busiest hour / day:** the largest value; ties go to the earlier one.
- **Previous 7 / 30 days:** the window immediately before the current one. The current window includes today so far, which is not a full day, so a small shortfall can be expected.
- **Monthly totals:** the last six calendar months. The current month is drawn lighter and described as "so far".

## Files

| File                               | Role                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `src/shared/analytics.js`          | Pure calculations (busiest hour, averages, month grouping, comparisons). |
| `src/shared/labels.js`             | Locale-aware day, month, and hour labels.                                |
| `src/shared/format-period.js`      | Neutral wording for comparing periods.                                   |
| `src/dashboard/analytics-data.js`  | Loads and shapes data for each view.                                     |
| `src/dashboard/charts/*`           | Theme, pure Chart.js config builders, and the Chart.js factory.          |
| `src/dashboard/pages/analytics.js` | The page: controls, the three views, and chart lifecycle.                |

## Performance

The monthly view reads one range of up to about 190 day records in a single storage call. If history grows towards the 365-day retention limit, consider caching monthly totals.
