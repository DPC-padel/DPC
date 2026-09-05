# DPC test suite

Zero dependencies. Runs against the **shipped** source — tests extract functions
straight out of the real `.html`/`.js` files, so they fail if the app drifts.

```bash
node tests/run.mjs                       # coaching + leaderboard + players
node tests/run.mjs ./americano.test.mjs  # scheduler (parked)
```

| Suite | Covers |
|---|---|
| `coaching.test.mjs` | per-type pricing (`typeTotal`/`typePrice`/`sharePrice`), slot capacity (1:1 exclusive, 1:2 caps at 2, 1:3 at 3, `no_trio`, multi-slot worst-case) |
| `leaderboard.test.mjs` | `isGirl` sheet booleans, `rankGirls` merge/dedupe/re-rank, `qualifyByMatches` gate, tie clustering, `initials`/`avColor` |
| `players.test.mjs` | onboarding self-rating floor, phone normalisation (last-10), Application question numbering |
| `americano.test.mjs` | scheduler: partners, opponents, fairness, edge cases (parked) |
