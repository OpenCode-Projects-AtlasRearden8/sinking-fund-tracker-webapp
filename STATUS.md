# STATUS — Sinking Funds Tracker

Last updated: 2026-10-29
Owner: Asdale Dynamics, LLC

## What was built

A complete, offline, single-file web app for "savings with a purpose," exactly matching the original goal:

- **Named buckets** (`index.html`): starts pre-seeded with Property tax, Car fund, Holidays, and Vet visits; users add, edit, and delete any bucket. Each bucket has a target amount, a default monthly contribution, and a goal date.
- **Deposit log**: per-bucket deposits with amount, date, and optional note; full history view with per-deposit removal.
- **Cheerful progress bars**: green gradient bar per bucket plus an overall bar across all buckets, with stage-based encouragement ("Past halfway — steady wins the race.") and a gold shine effect at completion. Accessibility is covered via `role="progressbar"` with `aria-valuenow`.
- **Month-by-month forecast**: expandable table per bucket showing projected balance for each remaining month through the goal date.
- **Gentle catch-up suggestions**: when the current plan would miss the target, the forecast line quietly suggests the exact extra dollar amount per month, rounded up to the cent (e.g. "You are close — saving about $3.34 more each month…"). If the goal date has passed, it suggests a one-time deposit or a new date. It never scolds.
- **CSV export**: one button downloads the whole deposit log (`Bucket, Date, Amount, Note`, sorted by date, properly escaped) as `sinking-funds-deposits-YYYY-MM-DD.csv` via a Blob download that works from `file://`.
- **localStorage persistence**: all data under key `sinkingFundsTracker.v1`; stored data is sanitized on load so corrupt or hand-edited storage cannot crash the app. No network calls of any kind.

Implementation notes:

- Pure HTML/JS/CSS, zero dependencies, everything in one `index.html` that runs from `file://` by double-click.
- The forecast/validation/CSV math lives in a pure API (`SFT`, also exported as `module.exports`) at the top of the inline script; DOM code is guarded so the same file runs untouched in the Node test sandbox. The tests therefore exercise the exact code the browser runs.
- All user text is HTML-escaped before rendering; money is rounded to cents at every write.
- ADHD-friendly touches: everything is one flat page, forms are small and forgiving, actions give immediate gentle feedback through an `aria-live` status line, and delete asks for confirmation.

## How to run it

- Open `index.html` in any modern browser (double-click; works from `file://`). No server, build step, or internet needed.
- Run the tests with Node 18+: `npm test` (or `node tests/run-tests.js && node tests/smoke-tests.js`).

## Verification results (2026-10-29)

- `tests/run-tests.js` — **23/23 PASS**: forecast math (months remaining across year boundaries, month-by-month table, projected totals, first goal month), catch-up suggestion math (round-up to cent, on-track null, passed-date case), date parsing/validation, CSV building and escaping, money rounding, input validation, state sanitization, and default bucket seeding.
- `tests/smoke-tests.js` — **13/13 PASS**: the full app boots under a DOM stub — seeds defaults, renders cards/progress bars/summary, opens and saves deposits (and rejects invalid ones without touching storage), edits and deletes buckets, deletes deposits, validates the bucket form, exports a dated CSV blob with the correct header, and stays quiet when there is nothing to export.
- `npm test` passes end to end; single `npm test` command verified.
- Confirmed `index.html` has exactly one `<script>` and one `<style>` block with matching closes, and `LICENSE` contains the exact line `Copyright (c) 2026 Asdale Dynamics, LLC`.
- No secrets, API keys, or personal data in any file.

## Known gaps

- **No real-browser manual test was possible here** (CLI-only environment). The smoke tests replace actual DOM/browser APIs with stubs, so rendering visuals (CSS layout, Blob-download behavior in specific browsers) was verified logically but not pixel-verified. Anything with a modern browser should confirm by opening `index.html` once.
- Forecast assumes a constant monthly contribution through the goal date; it does not model one-time deposits recurring or irregular schedules.
- Deposits are recorded inside each bucket rather than linking to a bank/account; there is no import (export only).
- Data lives in one browser's localStorage — no sync or multi-device support, by design. Clearing site data erases it (CSV export is the manual backup).
- No bulk import of the exported CSV, and no separate summary CSV (only the deposit log exports).
- Contribution timing is month-granular: deposits after the goal month are not counted toward that goal's forecast.
