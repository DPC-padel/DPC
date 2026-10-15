// Usage:  node tests/run.mjs            → default suites
//         node tests/run.mjs ./americano.test.mjs   → a specific suite
// (americano is parked — run it explicitly when we pick that up again)
import { report } from "./lib/harness.mjs";
const DEFAULT = [
  "./errors.test.mjs", "./home.test.mjs", "./login.test.mjs", "./application.test.mjs", "./players.test.mjs",
  "./dashboard.test.mjs", "./games.test.mjs", "./coaching.test.mjs", "./leaderboard.test.mjs", "./founder.test.mjs",
];
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
let loadFailed = false;
for (const f of files) {
  try { await import(f); } catch (e) { loadFailed = true; console.log(`\n! could not load ${f}: ${e.message}`); }
}
const { fail } = await report();
if (loadFailed && !fail) process.exitCode = 1;   // a suite that can't even load is a failure
