# Leaderboard — Supabase speed cache

Makes the leaderboard load fast by putting Supabase between Google Sheets and
the website. You keep editing scores in Sheets; a sync pushes the data to
Supabase; the site reads Supabase (one ~100ms CDN-cached call) instead of the
4 slow Apps Script endpoints.

```
Google Sheets (you edit)
   → 4 existing Apps Script endpoints (unchanged)
   → supabase-sync.gs  (pulls all 4, every 5 min)
   → Supabase: leaderboard_cache table
   → website reads Supabase   (Apps Script stays as automatic fallback)
```

## Why a JSON cache and not real tables

Each endpoint returns several arrays with inconsistent column names
(`"Semi  R"`, `"Weighted sum"`, `breakPointOverall`, `players`, `data`, …).
Modelling every column in Postgres would be fragile and pointless for a
read-only board. Instead each endpoint's exact JSON is stored as one row, and
the website's existing normalizers in `script.js` run unchanged.

## Setup

1. **Create the table** — Supabase SQL editor → run `supabase-schema.sql`.
2. **Deploy the sync** — script.google.com → New project → paste
   `supabase-sync.gs`. Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
   (Settings → API → service_role key). Run `syncAll()` once and authorise it,
   then run `installTrigger()` once for the 5-minute auto-sync.
3. **Point the website at Supabase** — in `script.js`, set `SUPABASE.url` and
   `SUPABASE.anonKey` (the public anon key, not the service key).

That's it. Until step 3 is done the site behaves exactly as before. After it,
the site reads Supabase and only falls back to Apps Script if Supabase is
unreachable — so the board never goes dark.

## Keys — which goes where

| Key | Where it lives | Why |
| --- | --- | --- |
| `service_role` | `supabase-sync.gs` (Apps Script) only | can write; must stay secret |
| `anon` public key | `script.js` (website) | read-only via RLS; safe to ship |

## Freshness

The timer syncs every 5 minutes. For near-instant updates, open a sheet's own
Apps Script and add an installable onEdit/onChange trigger that calls `syncAll`
(see the note at the bottom of `supabase-sync.gs`).

## Adding matchPoint / noida sheets later

`supabase-sync.gs` and the website already handle all four sources. When those
sheets are ready there's nothing to change here.
