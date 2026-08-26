# Dashboard — Supabase speed cache

Same idea as the leaderboard, but the dashboard is **per-player** (queried
by phone), so the cache stores **one row per player** instead of one shared blob.

```
Google Sheets (players + matches)
   → getAllPlayers / getPlayer / getPlayerMatches (existing Apps Script)
   → supabase-sync.gs  (builds per-player rows, every 10 min)
   → Supabase: dashboard_cache table   (phone → player + matches JSON)
   → dashboard reads Supabase by phone  (Apps Script stays as fallback)
```

## Setup

1. **Create the table** — Supabase SQL editor → run `supabase-schema.sql`
   (same project as the leaderboard; adds a second table `dashboard_cache`).
2. **Deploy the sync** — script.google.com → new project (or reuse the
   leaderboard one) → paste `supabase-sync.gs`. Set `SUPABASE_SERVICE_KEY`
   to the **legacy service_role** JWT (`eyJ…`). Run `syncDashboard()` once,
   then `installTrigger()` for the 10-minute auto-sync.
3. **Website** — already wired in `Dashboard/index.html` (`SUPABASE` config +
   `fetchFromAPI` reads the cache, falls back to Apps Script). Just push it.

## Privacy note

`dashboard_cache` has a public-read policy, so anyone with the public key and a
phone number can read that player's stats — the **same** exposure as the current
Apps Script endpoints (which are public and phone-parameterised). To lock it
down later: gate reads behind Supabase Auth or an edge function that verifies
the logged-in session.

## Scaling note

The sync makes ~2 Apps Script calls per player who has played. Fine at the
current ~19 players. If the roster grows large, switch the sync to read the
players/matches sheets directly (a sheet-bound script) instead of per-player
web calls.
