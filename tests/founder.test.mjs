// Founder dashboard: date parsing, weeks, de-duplicating match rows, and the
// activity and money numbers for a period.
import { readFileSync } from "node:fs";
import { ROOT, extractFns, suite, test, ok, eq } from "./lib/harness.mjs";

const src = readFileSync(ROOT + "founder/index.html", "utf8");
const line = (re, what) => { const m = src.match(re); if (!m) throw new Error(`founder.test: ${what} not found`); return m[0]; };
const MON = line(/const MON = \[[^\]]+\];/, "MON");
const PCT = line(/const pctS = .+;/, "pctS");

function founder(state = {}) {
  const pre = `${MON}\n${PCT}\nvar FIN = __s.FIN || null, MATCHES = __s.MATCHES || [], FIRST_SEEN = {};`;
  return new Function("__s", pre + "\n" +
    extractFns("founder/index.html", ["parseDate", "startOfWeek", "flattenMatches", "fromAllMatches", "computeFirstSeen", "finFor", "actFor", "delta"]) +
    "\nreturn { parseDate, startOfWeek, flattenMatches, fromAllMatches, finFor, actFor, delta, firstSeen: () => { computeFirstSeen(); return FIRST_SEEN; } };")(state);
}
const F = founder();
const ymd = (d) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()];

suite("Founder · dates and weeks");

test("'19 Apr 2026' and '14 September 2026'", () => {
  eq(ymd(F.parseDate("19 Apr 2026")), [2026, 4, 19]);
  eq(ymd(F.parseDate("14 September 2026")), [2026, 9, 14]);
});
test("ISO dates work; blank or unknown months give null", () => {
  ok(F.parseDate("2026-09-14") instanceof Date);
  eq([F.parseDate(""), F.parseDate("31 Foo 2026")], [null, null]);
});
test("weeks start on Monday at midnight", () => {
  const w = F.startOfWeek(new Date(2026, 8, 20, 15, 30));   // Sunday
  eq([...ymd(w), w.getHours()], [2026, 9, 14, 0]);
  eq(ymd(F.startOfWeek(new Date(2026, 8, 14, 9))), [2026, 9, 14]);   // Monday stays
});

suite("Founder · match rows");

test("one row per event per player, skipping rows without an id or a date", () => {
  const out = F.flattenMatches([
    { phone: "1", matches: [{ matchId: "T1", date: "14 Sep 2026", matchType: "Tournament" }, { matchId: "T1", date: "14 Sep 2026" }, { matchId: "", date: "14 Sep 2026" }, { matchId: "A1", date: "bad" }] },
    { phone: "2", matches: [{ matchId: "T1", date: "14 Sep 2026" }] },
  ]);
  eq(out.map((m) => [m.id, m.phone, m.type]), [["T1", "1", "Tournament"], ["T1", "2", "Other"]]);
});
test("name-keyed rows de-duplicate regardless of case and spaces", () => {
  const out = F.fromAllMatches([
    { matchId: "A1", date: "1 Sep 2026", name: "Karan" },
    { matchId: "A1", date: "1 Sep 2026", name: " karan " },
    { matchId: "A1", date: "1 Sep 2026", name: "" },
  ]);
  eq(out.map((m) => m.key), ["karan"]);
});

suite("Founder · activity for a period");

test("events, unique players, new vs returning, repeat rate", () => {
  const d = (s) => F.parseDate(s);
  const P = founder({ MATCHES: [
    { id: "A-1", key: "p2", date: d("15 Aug 2026"), type: "Americano" },
    { id: "A1", key: "p1", date: d("1 Sep 2026"), type: "Americano" },
    { id: "A2", key: "p1", date: d("8 Sep 2026"), type: "Americano" },
    { id: "A2", key: "p2", date: d("8 Sep 2026"), type: "Americano" },
  ] });
  P.firstSeen();
  const a = P.actFor({ start: new Date(2026, 8, 1), end: new Date(2026, 8, 30, 23, 59, 59) });
  eq([a.events, a.played, a.unique, a.newPlayers, a.returning, a.repeatRate], [2, 3, 2, 1, 1, 0.5]);
  eq(a.freq, { one: 1, two: 1, three: 0, more: 0 });
});

suite("Founder · money for a period");

const FIN = { gstRate: 0.18, months: [
  { key: "2026-08", hasData: true, revenue: 118000, cost: 50000, sponsor: 18000 },
  { key: "2026-09", hasData: true, revenue: 59000, cost: 30000, sponsor: 0 },
  { key: "2026-10", hasData: false, revenue: 0, cost: 0, sponsor: 0 },
] };

test("a quarter sums only the months with data", () => {
  const f = founder({ FIN }).finFor({ monthKeys: ["2026-08", "2026-09", "2026-10"] });
  eq([f.revenue, f.cost, f.sponsor, f.players, f.margin, f.months, f.single], [177000, 80000, 18000, 159000, 97000, 2, null]);
  ok(Math.abs(f.marginPct - 97000 / 177000) < 1e-9);
});
test("a single month carries its row", () => eq(founder({ FIN }).finFor({ monthKey: "2026-09" }).single.key, "2026-09"));
test("weeks and missing financials give nothing", () => {
  eq(founder({ FIN }).finFor({ start: new Date(), end: new Date() }), null);
  eq(founder().finFor({ monthKey: "2026-09" }), null);
});
test("change arrows", () => {
  ok(/delta up/.test(F.delta(0.125, "vs last month")) && /12\.50%/.test(F.delta(0.125, "")), F.delta(0.125, ""));
  ok(/delta down/.test(F.delta(-0.1, "")) && /10%/.test(F.delta(-0.1, "")), F.delta(-0.1, ""));
  ok(/delta flat/.test(F.delta(0.0001, "")));
  eq(F.delta(null, ""), "");
});
