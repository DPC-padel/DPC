# Dashboard — Supabase speed cache

Same idea as the leaderboard, but the dashboard is **per-player** (queried
by phone), so the cache stores **one row per player** instead of one shared blob.

```
Rating&Ranking sheet (Player_ID + BP_/FS_match + the calculated boards)
   → leaderboard/ratings-api.gs  (sheet-bound; rebuilds on every sheet change)
   → Supabase: dashboard_cache table   (phone → player + matches JSON)
   → dashboard reads Supabase by phone  (the same script's getPlayer /
     getPlayerMatches are the fallback)
```

The same script also writes the Break Point and First Serve rows of
`leaderboard_cache`, so one sync covers both. It reads the sheet directly —
no per-player web calls. Setup steps are at the top of `ratings-api.gs`.

## Privacy note

`dashboard_cache` has a public-read policy, so anyone with the public key and a
phone number can read that player's stats — the **same** exposure as the current
Apps Script endpoints (which are public and phone-parameterised). To lock it
down later: gate reads behind Supabase Auth or an edge function that verifies
the logged-in session.
