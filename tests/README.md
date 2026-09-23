# DPC test suite

Zero dependencies. Two parts:

- **Unit tests** run against the **shipped** source — they pull functions straight out of the real `.html`/`.js` files, so they fail if the site drifts. No network, nothing written anywhere.
- **Health check** hits the live site, every Apps Script and Supabase cache, and does two real saves. Runs every 2 days on its own and emails an alert when anything fails.

```bash
node tests/run.mjs                        # all unit tests
node tests/run.mjs ./games.test.mjs       # one suite
node tests/run.mjs ./americano.test.mjs   # scheduler (parked)
node tests/health.mjs                     # live health check — writes to the live sheets, see below
```

| Suite | Covers |
|---|---|
| `errors.test.mjs` | shared `errors.js`: ignored noise, what's sent (page path only, no phone numbers), flood limit, on-page messages, every page loads it first |
| `home.test.mjs` | Dashboard button session check; Home doesn't sign players out earlier than login |
| `login.test.mjs` | 90-day rolling session, "not registered" detection, friendly network errors |
| `application.test.mjs` | self-rating pieces; never the Sep 8 deployment that didn't save; only `{ok:true}` counts as saved |
| `players.test.mjs` | onboarding self-rating floor, phone normalisation (last-10), Application question numbering |
| `dashboard.test.mjs` | rating/ranking history charts, match filters and numbering, on-phone cache version, rating from the Master venue's board, Supabase → Apps Script fallback |
| `games.test.mjs` | sheet dates/times, RSVP save retries, partner sign-ups (player already saved, partner failing, tap again), finding your registration |
| `coaching.test.mjs` | per-type pricing, slot capacity, live-not-demo, times and request ids, failures reported |
| `leaderboard.test.mjs` | Girls board, qualification gate, ties, sheet → board rows, failures reported |
| `founder.test.mjs` | date parsing, weeks, match de-dupe, activity and money per period |
| `americano.test.mjs` | scheduler: partners, opponents, fairness, edge cases (parked) |

## Health check

`health.mjs` runs, in order:

1. the unit tests
2. every public page loads
3. every Apps Script answers (games, matches, players, coaching, founder financials, 4 leaderboards); the games (≤ 15 min) and leaderboard (≤ 2 h) caches are fresh; and every recorded match is on a dashboard (the dashboard sync runs when Master is edited, not on a timer, so its age alone means nothing)
4. two real saves, both as `DPC HEALTHCHECK`, phone `1000000001`:
   - a **waitlist registration** on the next upcoming game, saved through the Supabase inbox like the site does, removed straight after
   - an **application** — the Application script can't delete, so each run leaves one row in the response sheet to clear. Master only ever gets one row (it skips duplicate phones).

Failures are emailed through the "DPC Errors" Apps Script (`DPC_ERRORS_URL` in `errors.js`, deployed with access "Anyone") and the run exits 1. The same script receives errors players hit on the website.

## Schedule

A LaunchAgent on this Mac runs `health.mjs` every 48 hours while the Mac is on:
`~/Library/LaunchAgents/com.padelcollective.healthcheck.plist`, log at `~/Library/Logs/dpc-healthcheck.log`.

```bash
launchctl kickstart gui/$(id -u)/com.padelcollective.healthcheck                            # run it now
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.padelcollective.healthcheck.plist  # turn it off
```
