// Leaderboard: Girls filter, ranking, qualification gate, display helpers.
import { readFileSync } from "node:fs";
import { ROOT, loadFns, suite, test, ok, eq } from "./lib/harness.mjs";

const L = loadFns("leaderboard/script.js",
  ["isGirl", "rankGirls", "qualifyByMatches", "addClusterRanks", "compareByScore", "initials", "avColor"],
  'var MIN_MATCHES = 2; var AV_COLORS = ["#9d7bc9","#5b6472","#2f8f83","#c1614f","#3f9d7f","#7c6fc9","#b1793f","#4f7cc1","#a85a86","#3d8f8f"];');

suite("Leaderboard · isGirl (sheet boolean column)");

test("accepts the truthy spellings the sheet produces", () => {
  for (const v of [true, "TRUE", "true", "True", " true ", "yes", "YES", "1", 1, "y", "Y"])
    ok(L.isGirl({ Girls: v }), `expected true for ${JSON.stringify(v)}`);
});

test("rejects falsey / blank / absent values", () => {
  for (const v of [false, "FALSE", "false", "", "  ", "no", "0", 0, null, undefined])
    ok(!L.isGirl({ Girls: v }), `expected false for ${JSON.stringify(v)}`);
  ok(!L.isGirl({}), "row with no Girls column should not be a girl");
});

test("reads any of the column-name casings", () => {
  for (const k of ["Girls", "girls", "GIRLS", "Girl", "girl"])
    ok(L.isGirl({ [k]: "TRUE" }), `column ${k} not recognised`);
});

suite("Leaderboard · rankGirls (merge boards, dedupe, re-rank)");

const g = (name, rating, score) => ({ name, rating, score });

test("sorts by rating desc, then score, then name", () => {
  const out = L.rankGirls([g("Bea", 2.1, 10), g("Ana", 3.0, 5), g("Cara", 2.1, 20)]);
  eq(out.map(p => p.name), ["Ana", "Cara", "Bea"]);
  eq(out.map(p => p.rank), [1, 2, 3]);
});

test("dedupes the same player across boards, keeping the stronger entry", () => {
  const out = L.rankGirls([g("Ana", 2.0, 10), g("Ana", 3.0, 4)]);
  eq(out.length, 1);
  eq(out[0].rating, 3.0);
});

test("dedupe is case-insensitive on name", () => {
  const out = L.rankGirls([g("ana sharma", 2.0, 10), g("Ana Sharma", 2.5, 1)]);
  eq(out.length, 1, "same person listed twice");
  eq(out[0].rating, 2.5);
});

test("on equal rating keeps the higher score", () => {
  const out = L.rankGirls([g("Ana", 2.0, 5), g("Ana", 2.0, 50)]);
  eq(out[0].score, 50);
});

test("ranks are 1..N with no gaps", () => {
  const out = L.rankGirls([g("A", 3, 1), g("B", 2, 1), g("C", 1, 1)]);
  eq(out.map(p => p.rank), [1, 2, 3]);
});

test("empty input gives an empty board, not a crash", () => eq(L.rankGirls([]), []));

suite("Leaderboard · qualifyByMatches (min-games gate)");

const p = (name, matches) => ({ name, matches });

test("drops players below the threshold and renumbers", () => {
  const out = L.qualifyByMatches([p("A", 5), p("B", 1), p("C", 2)]);
  eq(out.map(x => x.name), ["A", "C"]);
  eq(out.map(x => x.rank), [1, 2]);
});

test("min=0 keeps everyone (the Girls board case)", () => {
  const out = L.qualifyByMatches([p("A", 0), p("B", 1)], 0);
  eq(out.length, 2);
  eq(out.map(x => x.rank), [1, 2]);
});

test("missing/garbage match counts are treated as 0", () => {
  eq(L.qualifyByMatches([p("A", undefined), p("B", null), p("C", "abc")]).length, 0);
});

test("string match counts from the sheet still qualify", () => {
  eq(L.qualifyByMatches([p("A", "5")]).length, 1);
});

suite("Leaderboard · addClusterRanks (ties share a rank)");

test("equal scores share a rank, next distinct score jumps", () => {
  const out = L.addClusterRanks([{ score: 50 }, { score: 50 }, { score: 40 }]);
  eq(out.map(x => x.rank), [1, 1, 3]);
});

test("all-distinct scores rank 1..N", () => {
  eq(L.addClusterRanks([{ score: 9 }, { score: 8 }, { score: 7 }]).map(x => x.rank), [1, 2, 3]);
});

suite("Leaderboard · compareByScore");

test("score desc, then matches desc, then name asc", () => {
  const rows = [
    { name: "B", score: 10, matches: 3 },
    { name: "A", score: 10, matches: 3 },
    { name: "C", score: 10, matches: 9 },
    { name: "D", score: 20, matches: 1 },
  ].sort(L.compareByScore);
  eq(rows.map(r => r.name), ["D", "C", "A", "B"]);
});

suite("Leaderboard · display helpers");

test("initials handle one, two and many names", () => {
  eq(L.initials("Karan Sehgal"), "KS");
  eq(L.initials("Gobind"), "GO");
  eq(L.initials("  Prannay   Merchant  "), "PM");
  eq(L.initials("Ana Maria Sharma"), "AS");
});

test("initials never crash on empty input", () => {
  for (const v of ["", "   ", null, undefined]) eq(L.initials(v), "?", `failed for ${JSON.stringify(v)}`);
});

test("avatar colour is deterministic and always a real colour", () => {
  eq(L.avColor("Karan Sehgal"), L.avColor("Karan Sehgal"));
  for (const n of ["", null, "A", "a very long player name here"])
    ok(/^#[0-9a-f]{6}$/i.test(L.avColor(n)), `bad colour for ${JSON.stringify(n)}`);
});

// ── sheet rows → board rows ──────────────────────────────
const N = loadFns("leaderboard/script.js", ["toNumber", "toDecimal", "isVerified", "compareByScore", "addClusterRanks",
  "normalizeOverallRankings", "normalizeNoidaRankings", "normalizeAmericanoRankings", "normalizeTournamentRankings", "pickFirstServeRankingRows"]);

suite("Leaderboard · reading sheet values");

test("whole numbers and ratings", () => {
  eq([N.toNumber("12"), N.toNumber("3.7"), N.toNumber("abc"), N.toNumber(undefined)], [12, 3, 0, 0]);
  eq([N.toDecimal("3.33"), N.toDecimal("")], [3.33, 0]);
});
test("Verified accepts the sheet's TRUE in any case", () => {
  ok(N.isVerified({ Verified: "TRUE" }) && N.isVerified({ verified: true }) && N.isVerified({ Verified: " true " }));
  ok(!N.isVerified({ Verified: "FALSE" }) && !N.isVerified({}));
});

suite("Leaderboard · board rows");

test("overall: drops blank and #N/A rows, sorts by rank, reads rating and matches", () => {
  const out = N.normalizeOverallRankings([
    { ID: 2, Name: "B", Score: "10", Rating: "3.1", Ranking: 2, "Matches played": 4 },
    { ID: 1, Name: "A", Score: "12", Rating: "3.3", Ranking: 1, "Matches played": "6", Verified: "TRUE" },
    { ID: 3, Name: "", Ranking: 3 },
    { ID: 4, Name: "#N/A", Ranking: 4 },
  ]);
  eq(out.map((p) => [p.name, p.rank, p.rating, p.matches, p.verified]), [["A", 1, 3.3, 6, true], ["B", 2, 3.1, 4, false]]);
});
test("Americano: highest score first, ties share a rank", () => {
  const out = N.normalizeAmericanoRankings([{ "Player Name": "C", Score: 5, MP: 1 }, { "Player Name": "A", Score: 9, MP: 2 }, { "Player Name": "B", Score: 9, MP: 2 }]);
  eq(out.map((p) => [p.name, p.rank]), [["A", 1], ["B", 1], ["C", 3]]);
});
test("tournament: score first, then wins", () => {
  const out = N.normalizeTournamentRankings([{ "Player Name": "A", Score: 10, won: 1, MP: 3 }, { "Player Name": "B", Score: 10, won: 2, MP: 3 }]);
  eq(out.map((p) => p.name), ["B", "A"]);
});
test("Noida: the sheet's ranking when every row has one, else score", () => {
  eq(N.normalizeNoidaRankings([{ playerName: "B", ranking: 2, score: 50 }, { playerName: "A", ranking: 1, score: 10 }]).map((p) => p.name), ["A", "B"]);
  eq(N.normalizeNoidaRankings([{ playerName: "B", score: 5 }, { playerName: "A", score: 9 }]).map((p) => p.name), ["A", "B"]);
});
test("First Serve overall rows: the 'rankings' key, else any array with name, rating and score", () => {
  const rows = [{ Name: "A", Rating: 3, Score: 1 }];
  eq(N.pickFirstServeRankingRows({ rankings: rows, firstServe: [] }), rows);
  eq(N.pickFirstServeRankingRows({ someSheet: rows }), rows);
  eq(N.pickFirstServeRankingRows({ firstServe: rows, pmMatchScores: rows, tournamentScores: rows }), []);
  eq(N.pickFirstServeRankingRows({}), []);
});

suite("Leaderboard · failures are reported");

test("every board reports a failed load", () => {
  const js = readFileSync(ROOT + "leaderboard/script.js", "utf8");
  for (const b of ["First Serve", "Break Point", "Match Point", "Noida", "Girls"])
    ok(js.includes(`window.DPC?.report("Leaderboard: ${b}"`), `${b} failures aren't reported`);
});
