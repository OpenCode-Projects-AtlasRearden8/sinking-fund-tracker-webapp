# Sinking Funds Tracker

An offline web app for savings with a purpose. Create named buckets — property tax, car fund, holidays, vet visits — give each one a target, a monthly contribution, and a goal date, then log deposits and watch cheerful progress bars fill up. It forecasts your balance month by month to each goal date and offers gentle catch-up suggestions when you are falling short. Everything lives in your browser's `localStorage`; nothing is ever sent anywhere.

It is the saving-side companion to the envelope-budget-webapp (which handles weekly spending on the way out; this tracks the money going in for future goals).

Built and released by **Asdale Dynamics, LLC** — see [dylanasdale.github.io](https://dylanasdale.github.io) for plain-English AI guides and more practical tools.

## Features

- **Named buckets** — starts with Property tax, Car fund, Holidays, and Vet visits as editable examples; add, edit, and delete buckets freely. Everything is saved automatically in `localStorage`.
- **Targets, monthly contributions, goal dates** — each bucket has a goal amount, a default monthly contribution, and a goal date used for forecasting.
- **Deposit log** — add deposits with amount, date, and an optional note; view and remove them in each bucket's history.
- **Cheerful progress bars** — a smooth green bar per bucket (and an overall bar across all buckets) with encouraging messages at every stage, plus a gold shine when a goal is complete.
- **Month-by-month forecast** — every bucket can expand a table showing the projected balance for each month from next month through the goal date, so you can see exactly when you will get there.
- **Gentle catch-up suggestions** — if the current plan misses the target, the app quietly suggests the extra amount per month ("You are close — saving about $3.34 more each month would get you to $260.00 by 2027-01"), never scolding.
- **CSV export** — one button downloads your entire deposit log (`Bucket, Date, Amount, Note`) as a dated CSV file that opens in any spreadsheet.
- **Local and private** — no accounts, no network calls, no dependencies. Data persists in `localStorage` under the key `sinkingFundsTracker.v1`.

## How to run it

1. Download (or clone) this folder.
2. Double-click `index.html` — it runs straight from `file://` in any modern browser (Chrome, Firefox, Edge, Safari).
3. That's it. No server, no build step, no internet needed.

Your data stays in that browser. Clearing the browser's site data will erase it, so use **Download CSV of deposits** now and then if you want a backup.

## How the forecast math works

The forecast is intentionally simple and predictable (it is savings, not an investment):

- Months remaining = calendar months from the current month through the goal month (0 if the goal month has passed).
- Projected total = current saved amount + (monthly contribution × months remaining).
- The month-by-month table adds the monthly contribution at the start of each remaining month and shows the running balance.
- Catch-up suggestion = the goal gap divided by remaining months, rounded up to the cent; the app only speaks up when that number exceeds your current monthly plan.

Dollars are stored as numbers and rounded to cents at every write, so no pennies drift away to floating-point land.

## Running the tests

With Node.js 18+ installed:

```
npm test
```

or directly:

```
node tests/run-tests.js      # 23 tests for the forecast and CSV math
node tests/smoke-tests.js    # 13 tests that boot the whole UI under a DOM stub
```

The math tests load `index.html`, extract its inline script, and run the exported functions (`forecastTable`, `catchUpSuggestion`, `buildDepositCSV`, and friends) in a Node VM — so the tests always exercise the exact code the browser runs.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The entire app: markup, styles, and JavaScript in one file |
| `tests/run-tests.js` | Pure-function tests for forecast/CSV/validation math |
| `tests/smoke-tests.js` | DOM-stub tests that boot the app and click through the main flows |
| `LICENSE` | MIT license |
| `STATUS.md` | Build notes, verification results, and known gaps |

## Privacy and security

- 100% offline; no analytics, trackers, or network requests of any kind.
- No secrets or personal data belong in this app — it holds only the deposits you choose to record, in your own browser.
- All user-entered text is HTML-escaped before rendering, so notes and names are safe to type.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Asdale Dynamics, LLC.
