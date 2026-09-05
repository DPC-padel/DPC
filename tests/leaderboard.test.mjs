// Leaderboard: Girls filter, ranking, qualification gate, display helpers.
import { loadFns, suite, test, ok, eq } from "./lib/harness.mjs";

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
