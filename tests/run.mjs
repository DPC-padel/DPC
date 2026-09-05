// Usage:  node tests/run.mjs            → default suites
//         node tests/run.mjs ./americano.test.mjs   → a specific suite
// (americano is parked — run it explicitly when we pick that up again)
import { report } from "./lib/harness.mjs";
const DEFAULT = ["./coaching.test.mjs", "./leaderboard.test.mjs", "./players.test.mjs"];
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
for (const f of files) {
  try { await import(f); } catch (e) { console.log(`\n! could not load ${f}: ${e.message}`); }
}
report();
